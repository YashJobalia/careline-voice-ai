import { test } from "node:test";
import assert from "node:assert/strict";
import {
  runConversation,
  type ConversationServices,
} from "../src/lib/conversation-engine";
import {
  emptyPreferences,
  percentile,
  preferenceSchema,
} from "../src/lib/conversation";
import { VoiceActivity, isBackchannel } from "../src/lib/voice-activity";
import { phoneTwiml, validTwilioSignature } from "../src/lib/phone";
import twilio from "twilio";

const slot = {
  id: "11111111-1111-4111-8111-111111111111",
  doctor_id: "maya-shah",
  starts_at: "2030-05-15T20:00:00Z",
};
const bookingId = "22222222-2222-4222-8222-222222222222";
const services: ConversationServices = {
  user: { id: "test", name: "Test Patient" },
  availableSlots: async () => [slot],
  proposal: async (slotId, patientName, replacesId) => {
    assert.equal(slotId, slot.id);
    return {
      slot,
      patientName,
      token: "test-token",
      ...(replacesId ? { replaces: { id: replacesId, slot } } : {}),
    };
  },
  prepareRegistration: async (details) => ({
    ...details,
    token: "test-registration",
  }),
  appointments: async () => [
    {
      id: bookingId,
      slot_id: slot.id,
      patient_name: "Test Patient",
      created_at: "2026-01-01",
      status: "confirmed",
      slot,
    },
  ],
};
const call = (name: string, args: object) => ({
  type: "function_call",
  name,
  arguments: JSON.stringify(args),
  call_id: crypto.randomUUID(),
});
const reply = {
  type: "message",
  content: [{ type: "output_text", text: "Please review the details." }],
};
const availability = {
  department: "dermatology",
  doctorId: "maya-shah",
  date: "2030-05-15",
  afterHour: null,
};

async function scripted(outputs: object[][], run: () => Promise<void>) {
  const original = globalThis.fetch;
  let round = 0;
  const requests: { input: { type?: string; output?: string }[] }[] = [];
  globalThis.fetch = async (_url, init) => {
    requests.push(JSON.parse(String(init?.body)));
    assert.ok(round < outputs.length, "Unexpected extra model call");
    return Response.json({
      output: outputs[round++],
      usage: { input_tokens: 100, output_tokens: 20 },
    });
  };
  try {
    await run();
    assert.equal(round, outputs.length);
    return requests;
  } finally {
    globalThis.fetch = original;
  }
}

test("a corrected preference survives a later turn without transcript history", async () => {
  const wanted = {
    ...emptyPreferences(),
    department: "dermatology" as const,
    doctorId: "maya-shah",
    date: "2030-05-15",
    afterHour: 14,
  };
  await scripted(
    [[call("remember_preferences", wanted)], [reply]],
    async () => {
      const result = await runConversation(
        [{ role: "user", content: "Actually Wednesday after two" }],
        services,
      );
      assert.deepEqual(result.preferences, wanted);
      assert.equal(result.diagnostics.inputTokens, 200);
      assert.equal(result.diagnostics.traces.length, 3);
    },
  );
  const requests = await scripted(
    [
      [
        call("check_availability", {
          department: null,
          doctorId: null,
          date: null,
          afterHour: null,
        }),
      ],
      [reply],
    ],
    async () => {
      const result = await runConversation(
        [{ role: "user", content: "What times are available?" }],
        services,
        { preferences: wanted },
      );
      assert.deepEqual(result.preferences, wanted);
    },
  );
  const output = requests
    .at(-1)!
    .input.find((x) => x.type === "function_call_output")!;
  assert.equal(JSON.parse(output.output!)[0].id, slot.id);
});

test("a guessed slot cannot produce a booking proposal", async () => {
  let proposed = false;
  await scripted(
    [[call("prepare_appointment", { slotId: slot.id })], [reply]],
    async () => {
      const result = await runConversation(
        [{ role: "user", content: "Book it" }],
        {
          ...services,
          proposal: async () => {
            proposed = true;
            return { slot, patientName: "Test" };
          },
        },
      );
      assert.equal(result.proposal, undefined);
      assert.equal(proposed, false);
      assert.equal(result.diagnostics.traces[1].status, "error");
    },
  );
});

test("reschedule only prepares a move after fresh availability", async () => {
  await scripted(
    [
      [call("check_availability", availability)],
      [
        call("prepare_reschedule", {
          slotId: slot.id,
          appointmentId: bookingId,
        }),
      ],
      [reply],
    ],
    async () => {
      const result = await runConversation(
        [{ role: "user", content: "Move my visit" }],
        services,
      );
      assert.equal(result.proposal?.replaces?.id, bookingId);
      assert.equal(result.proposal?.token, "test-token");
    },
  );
});

test("changing preferences invalidates an earlier proposal and slot IDs", async () => {
  await scripted(
    [
      [call("check_availability", availability)],
      [call("prepare_appointment", { slotId: slot.id })],
      [
        call("remember_preferences", {
          ...emptyPreferences(),
          department: "ent",
        }),
      ],
      [call("prepare_appointment", { slotId: slot.id })],
      [reply],
    ],
    async () => {
      const result = await runConversation(
        [{ role: "user", content: "Change to ENT" }],
        services,
      );
      assert.equal(result.proposal, undefined);
    },
  );
});

test("knowledge answers return real source documents; handoff stays a preview", async () => {
  await scripted(
    [
      [call("search_clinic_knowledge", { topics: ["insurance", "invented"] })],
      [
        call("prepare_staff_handoff", {
          reason: "Insurance",
          summary: "Caller asks about a plan",
          unresolved: "Plan not verified",
        }),
      ],
      [reply],
    ],
    async () => {
      const result = await runConversation(
        [{ role: "user", content: "Do you accept my insurance?" }],
        services,
      );
      assert.deepEqual(
        result.sources.map((s) => s.id),
        ["insurance"],
      );
      assert.equal(result.handoff?.reason, "Insurance");
      assert.equal(result.proposal, undefined);
    },
  );
});

test("phone channel rejects registration even if a model calls the excluded tool", async () => {
  await scripted(
    [
      [
        call("prepare_registration", {
          name: "Fake Patient",
          dateOfBirth: "1990-01-01",
        }),
      ],
      [reply],
    ],
    async () => {
      const result = await runConversation(
        [{ role: "user", content: "Register me" }],
        { ...services, user: { ...services.user, guest: true } },
        { channel: "phone" },
      );
      assert.equal(result.registration, undefined);
      assert.equal(result.diagnostics.traces[1].status, "error");
    },
  );
});

test("cancellation does not expose another patient's appointment", async () => {
  await scripted(
    [
      [
        call("prepare_cancellation", {
          appointmentId: "33333333-3333-4333-8333-333333333333",
        }),
      ],
      [reply],
    ],
    async () => {
      const result = await runConversation(
        [{ role: "user", content: "Cancel another booking" }],
        services,
      );
      assert.equal(result.cancellation, undefined);
    },
  );
});

test("service failures are distinguishable from empty availability", async () => {
  const requests = await scripted(
    [[call("check_availability", availability)], [reply]],
    async () => {
      const result = await runConversation(
        [{ role: "user", content: "Find a time" }],
        {
          ...services,
          availableSlots: async () => {
            throw new Error("offline");
          },
        },
      );
      assert.equal(result.diagnostics.traces[1].status, "error");
    },
  );
  assert.match(
    requests.at(-1)!.input.find((x) => x.type === "function_call_output")!
      .output!,
    /service could not complete/,
  );
});

test("date, specialty and time conflicts are rejected", () => {
  for (const patch of [
    { date: "2030-02-30" },
    { doctorId: "maya-shah", department: "ent" },
    { afterHour: 17, beforeHour: 10 },
    { date: "2030-05-15", dateTo: "2030-05-14" },
  ])
    assert.equal(
      preferenceSchema.safeParse({ ...emptyPreferences(), ...patch }).success,
      false,
    );
});

test("acoustic detector ignores short clicks and waits through the selected pause", () => {
  const detector = new VoiceActivity(0, 1000);
  assert.equal(detector.update(0.08, 10).speechStart, false);
  assert.equal(detector.update(0.002, 40).accepted, false);
  detector.update(0.08, 200);
  assert.equal(detector.update(0.08, 370).speechStart, true);
  assert.equal(detector.update(0.002, 1200).done, false);
  detector.update(0.08, 1250);
  assert.equal(detector.update(0.002, 2249).done, false);
  assert.equal(detector.update(0.002, 2250).done, true);
});

test("silence rolls over without creating a paid transcription", () => {
  const result = new VoiceActivity(0).update(0.002, 29000);
  assert.equal(result.done, true);
  assert.equal(result.accepted, false);
  assert.equal(isBackchannel("mm-hmm"), true);
  assert.equal(isBackchannel("yes"), false);
  assert.equal(isBackchannel("wait, Thursday"), false);
});

test("latency percentiles handle empty and unordered samples", () => {
  assert.equal(percentile([], 0.95), null);
  assert.equal(percentile([100, 30, 70], 0.5), 70);
  assert.equal(percentile([100, 30, 70], 0.95), 100);
});

test("phone webhook signatures bind URL and parameters and XML is generated safely", () => {
  const url = "https://example.com/api/phone",
    params = { CallSid: "CA123" },
    secret = "test-only";
  const signature = twilio.getExpectedTwilioSignature(secret, url, params);
  assert.equal(validTwilioSignature(secret, signature, url, params), true);
  assert.equal(
    validTwilioSignature(secret, signature, url, { CallSid: "changed" }),
    false,
  );
  assert.equal(
    validTwilioSignature(secret, signature, url + "/other", params),
    false,
  );
  assert.match(phoneTwiml("wss://example.com/relay"), /ConversationRelay/);
  assert.throws(() => phoneTwiml("ws://example.com/relay"));
});

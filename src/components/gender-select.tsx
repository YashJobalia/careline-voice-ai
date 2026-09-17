"use client";
import { useState } from "react";
import { FormPicker } from "./form-picker";
const options = ["Female", "Male", "Non-binary", "Other", "Prefer not to say"];

export function GenderSelect({ value = "" }: { value?: string | null }) {
  const [selected, setSelected] = useState(value || "");
  const values =
    value && !options.includes(value) ? [value, ...options] : options;
  return (
    <FormPicker
      name="gender"
      label="Gender (optional)"
      value={selected}
      onChange={setSelected}
      options={[
        { value: "", label: "Select gender (optional)" },
        ...values.map((value) => ({ value, label: value })),
      ]}
    />
  );
}

/** Play MP3 as it arrives; unsupported browsers retain buffered playback. */
export async function speechSource(response: Response, signal: AbortSignal) {
  if (
    !response.body ||
    !response.headers.get("content-type")?.includes("audio/mpeg") ||
    typeof MediaSource === "undefined" ||
    !MediaSource.isTypeSupported("audio/mpeg")
  ) {
    const blob = await response.blob();
    signal.throwIfAborted();
    return { url: URL.createObjectURL(blob), load: async () => {} };
  }
  const source = new MediaSource();
  const body = response.body;
  return {
    url: URL.createObjectURL(source),
    load: async () => {
      const reader = body.getReader();
      try {
        await mediaEvent(source, "sourceopen", signal);
        const buffer = source.addSourceBuffer("audio/mpeg");
        while (true) {
          signal.throwIfAborted();
          const { done, value } = await reader.read();
          if (done) break;
          signal.throwIfAborted();
          buffer.appendBuffer(new Uint8Array(value));
          await mediaEvent(buffer, "updateend", signal);
        }
        signal.throwIfAborted();
        if (source.readyState === "open") source.endOfStream();
      } finally {
        await reader.cancel().catch(() => {});
        reader.releaseLock();
      }
    },
  };
}

function mediaEvent(target: EventTarget, event: string, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      target.removeEventListener(event, done);
      target.removeEventListener("error", fail);
      signal.removeEventListener("abort", aborted);
    };
    const done = () => {
      cleanup();
      resolve();
    };
    const fail = () => {
      cleanup();
      reject(new Error("Voice playback failed. Please try again."));
    };
    const aborted = () => {
      cleanup();
      reject(signal.reason);
    };
    if (signal.aborted) {
      aborted();
      return;
    }
    target.addEventListener(event, done, { once: true });
    target.addEventListener("error", fail, { once: true });
    signal.addEventListener("abort", aborted, { once: true });
  });
}

type Level = "info" | "warn" | "error";

function emit(level: Level, step: string, msg: string, data?: Record<string, unknown>) {
  const line = `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} [${step}] ${msg}`;
  const out = data ? `${line} ${JSON.stringify(data)}` : line;
  (level === "error" ? console.error : console.log)(out);
}

export function logger(step: string) {
  return {
    info: (msg: string, data?: Record<string, unknown>) => emit("info", step, msg, data),
    warn: (msg: string, data?: Record<string, unknown>) => emit("warn", step, msg, data),
    error: (msg: string, data?: Record<string, unknown>) => emit("error", step, msg, data),
  };
}

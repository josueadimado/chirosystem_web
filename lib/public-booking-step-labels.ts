/** Plain-language step names shown on the public booking wizard. */
export function publicBookingStepLabel(flow: "new" | "reschedule" | "view", step: 1 | 2 | 3 | 4): string {
  if (flow === "reschedule") {
    const labels = ["Find visit", "Your visit", "New time", "Confirm"] as const;
    return labels[step - 1];
  }
  if (flow === "view") {
    const labels = ["My visits", "—", "—", "—"] as const;
    return labels[step - 1];
  }
  const labels = ["Visit type", "Provider", "Time", "Your info"] as const;
  return labels[step - 1];
}

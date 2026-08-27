/** Plain-language step names shown on the public booking wizard. */
export function publicBookingStepLabel(
  flow: "new" | "reschedule" | "update_info",
  step: 1 | 2 | 3 | 4,
): string {
  if (flow === "update_info") {
    return "Update info";
  }
  if (flow === "reschedule") {
    const labels = ["My visits", "Your visit", "New time", "Confirm"] as const;
    return labels[step - 1];
  }
  const labels = ["Visit type", "Provider", "Time", "Your info"] as const;
  return labels[step - 1];
}

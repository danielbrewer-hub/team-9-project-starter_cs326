import {
  createEventAppHarness,
  signInAs,
} from "../support/eventAppHarness";

describe("event creation live validation", () => {
  it("renders live date validation wiring for the creation form", async () => {
    const { app } = createEventAppHarness();
    const agent = await signInAs(app, "staff");

    const response = await agent.get("/events/new").expect(200);

    expect(response.text).toContain("validateDateRange");
    expect(response.text).toContain('x-ref="startDatetime"');
    expect(response.text).toContain('x-ref="endDatetime"');
    expect(response.text).toContain("currentDatetimeLocal");
    expect(response.text).toContain("startInput.min = now");
    expect(response.text).toContain("endInput.min = start");
    expect(response.text).toContain("setCustomValidity");
    expect(response.text).toContain("Start time must be in the future.");
    expect(response.text).toContain("End time must be after the start time.");
    expect(response.text).toContain('x-text="startDatetimeError"');
    expect(response.text).toContain('x-text="dateRangeError"');
    expect(response.text).toContain('aria-live="polite"');
  });
});

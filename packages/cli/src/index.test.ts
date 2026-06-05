import { afterEach, describe, expect, it, vi } from "vitest";
import { createProgram, placeholderMessages } from "./index";

describe("toollatch CLI placeholders", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each(Object.keys(placeholderMessages) as Array<keyof typeof placeholderMessages>)(
    "prints the %s placeholder",
    (command) => {
      const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

      createProgram().parse([command], { from: "user" });

      expect(log).toHaveBeenCalledWith(placeholderMessages[command]);
    },
  );
});

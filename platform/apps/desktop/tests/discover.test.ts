import { describe, expect, it } from "vitest";
import { exeFromIconOrCommand } from "../src/main/launcher/discover-win";

describe("exeFromIconOrCommand", () => {
  it("strips icon index from DisplayIcon", () => {
    expect(exeFromIconOrCommand("D:\\workbuddy\\WorkBuddy.exe,0")).toBe(
      "D:\\workbuddy\\WorkBuddy.exe"
    );
    expect(exeFromIconOrCommand("C:\\Apps\\Tool.exe,-1")).toBe("C:\\Apps\\Tool.exe");
  });

  it("unwraps quoted uninstall commands and drops arguments", () => {
    expect(exeFromIconOrCommand('"C:\\Program Files\\App\\Uninstall.exe" /S')).toBe(
      "C:\\Program Files\\App\\Uninstall.exe"
    );
  });

  it("accepts plain exe paths", () => {
    expect(exeFromIconOrCommand("C:\\Apps\\App.exe")).toBe("C:\\Apps\\App.exe");
  });

  it("rejects non-exe values", () => {
    expect(exeFromIconOrCommand("C:\\Apps\\icon.ico")).toBeNull();
    expect(exeFromIconOrCommand("")).toBeNull();
    expect(exeFromIconOrCommand(undefined)).toBeNull();
  });
});

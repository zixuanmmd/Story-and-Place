import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const standardForm = readFileSync(
  new URL("../../components/forms/entry-form.tsx", import.meta.url),
  "utf8",
);
const onboardingForm = readFileSync(
  new URL("../../components/onboarding/onboarding-entry-form.tsx", import.meta.url),
  "utf8",
);
const onboardingWelcome = readFileSync(
  new URL("../../components/onboarding/onboarding-view.tsx", import.meta.url),
  "utf8",
);
const mapExperience = readFileSync(
  new URL("../../components/map/map-experience.tsx", import.meta.url),
  "utf8",
);

describe("story template UI contract", () => {
  it("offers the shared picker in standard creation and first-story creation", () => {
    expect(standardForm).toContain("<StoryTemplatePicker");
    expect(standardForm).toContain('mode === "create"');
    expect(onboardingForm).toContain("<StoryTemplatePicker");
  });

  it("maps onboarding interests to a validated template URL", () => {
    expect(onboardingWelcome).toContain("getTemplateForInterests(selected)");
    expect(onboardingWelcome).toContain('params.set("template", template)');
    expect(mapExperience).toContain("parseStoryTemplateId(searchParams.get(\"template\"))");
  });

  it("preserves the selected template while a signed-out draft is restored", () => {
    expect(mapExperience).toContain('restoreParams.set("template", initialTemplateId)');
    expect(mapExperience).toContain("initialTemplateId={initialTemplateId}");
  });

  it("continues to use the existing validated entry and tag save path", () => {
    expect(standardForm).toContain("entryFormSchema");
    expect(standardForm).toContain("tagInputSchema.safeParse");
    expect(onboardingForm).toContain("entryFormSchema");
    expect(onboardingForm).toContain("tagInputSchema.safeParse");
  });
});

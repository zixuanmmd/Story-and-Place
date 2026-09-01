import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const projectFile = (path: string) => readFileSync(
  new URL(`../../${path}`, import.meta.url),
  "utf8",
);

describe("product analytics instrumentation contract", () => {
  it.each([
    ["components/auth/auth-form.tsx", ["signup_started", "signup_completed"]],
    ["components/onboarding/onboarding-view.tsx", ["onboarding_started", "onboarding_skipped"]],
    ["components/onboarding/onboarding-complete-view.tsx", ["onboarding_completed"]],
    ["components/map/map-experience.tsx", ["story_create_started", "story_created", "story_published", "draft_resumed"]],
    ["hooks/use-entry-autosave.ts", ["draft_created"]],
    ["components/routes/story-route-builder.tsx", ["route_created"]],
    ["components/search/global-search-view.tsx", ["search_used", "search_result_opened"]],
    ["components/explore/explore-view.tsx", ["explore_opened"]],
    ["components/entries/entry-share-view.tsx", ["public_story_opened", "story_shared"]],
    ["components/profiles/public-profile-view.tsx", ["public_profile_opened"]],
    ["components/settings/data-portability-panel.tsx", ["export_started", "export_completed"]],
    ["lib/data/entry-collaboration.ts", ["invitation_sent", "invitation_accepted"]],
  ])("instruments %s", (path, events) => {
    const source = projectFile(path);
    for (const event of events) expect(source).toContain(`"${event}"`);
  });

  it("records only a count bucket and result type for search behavior", () => {
    const search = projectFile("components/search/global-search-view.tsx");
    expect(search).toContain("result_count_bucket: bucketResultCount(nextPage.totalCount)");
    expect(search).toContain("result_type: result.result_type");
    expect(search).not.toContain("recordProductEvent(\"search_used\", applied");
    expect(search).not.toContain("query: applied.query");
  });
});

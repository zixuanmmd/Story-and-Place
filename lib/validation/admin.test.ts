import { describe, expect, it } from "vitest";
import { adminProductAnalyticsSchema, adminReportSchema, adminUserSchema } from "./admin";

const user = {
  id: "11111111-1111-4111-8111-111111111111",
  username: "map-traveler",
  display_name: "地图旅人",
  avatar_url: null,
  created_at: "2026-08-29T00:00:00Z",
  last_sign_in_at: null,
  account_status: "active",
  is_admin: false,
  story_count: 1,
  route_count: 0,
  report_count: 0,
};

const report = {
  id: "22222222-2222-4222-8222-222222222222",
  target_type: "entry",
  target_id: "33333333-3333-4333-8333-333333333333",
  reason: "privacy",
  description: "可能包含个人信息",
  status: "pending",
  created_at: "2026-08-29T00:00:00Z",
  reviewed_at: null,
  review_notes: null,
  reporter_name: "举报者",
  target_label: "公开故事",
  target_href: "/entries/33333333-3333-4333-8333-333333333333",
};

describe("admin response validation", () => {
  it("accepts the public account fields used by the console", () => {
    expect(adminUserSchema.parse(user)).toEqual(user);
  });

  it("rejects accidental email exposure", () => {
    expect(adminUserSchema.safeParse({ ...user, email: "hidden@example.invalid" }).success).toBe(false);
  });

  it("rejects accidental story-body exposure in report rows", () => {
    expect(adminReportSchema.parse(report)).toEqual(report);
    expect(adminReportSchema.safeParse({ ...report, content: "private body" }).success).toBe(false);
  });

  it("accepts aggregate analytics while rejecting raw identities", () => {
    const analytics = {
      range: { start_at: "2026-08-01T00:00:00Z", end_at: "2026-08-29T00:00:00Z" },
      acquisition: { signups: 10, tracked_active_users: 8 },
      activation: {
        cohort_users: 10, onboarding_completed: 8, onboarding_rate: 80,
        first_story_created: 6, first_story_rate: 60,
        second_story_created: 3, second_story_rate: 30,
      },
      engagement: {
        stories_created: 12, story_creators: 6, stories_per_creator: 2,
        route_creators: 2, route_adoption_rate: 25,
        search_visitors: 5, explore_visitors: 7,
      },
      activation_funnel: {
        signup_completed: 10, onboarding_completed: 8,
        first_story_created: 6, second_story_created: 3, returned_within_7d: 2,
      },
      explore_funnel: {
        explore_opened: 7, public_story_opened: 5,
        public_profile_opened: 2, signup_completed: 1,
      },
      retention: {
        d1: { eligible: 9, retained: 4, rate: 44.44 },
        d7: { eligible: 5, retained: 2, rate: 40 },
        d30: { eligible: 0, retained: 0, rate: 0 },
      },
      daily: [{ day: "2026-08-29", signups: 1, active_users: 3, stories: 2 }],
    };
    expect(adminProductAnalyticsSchema.parse(analytics)).toEqual(analytics);
    expect(adminProductAnalyticsSchema.safeParse({ ...analytics, user_ids: [user.id] }).success).toBe(false);
  });
});

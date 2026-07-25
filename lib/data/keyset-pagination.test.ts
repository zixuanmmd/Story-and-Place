import { describe, expect, it } from "vitest";
import {
  ascendingTimestampFilter,
  descendingTimestampFilter,
  mergeUniqueById,
} from "./keyset-pagination";

const cursor = {
  timestamp: "2026-07-25T06:20:12.101435+00:00",
  id: "0ea21e54-763a-4bbf-a72d-a7600046f921",
};

describe("复合游标分页", () => {
  it("降序游标用时间与稳定 ID 一起排除上一页", () => {
    expect(descendingTimestampFilter("created_at", "id", cursor)).toBe(
      "created_at.lt.2026-07-25T06:20:12.101435+00:00,and(created_at.eq.2026-07-25T06:20:12.101435+00:00,id.lt.0ea21e54-763a-4bbf-a72d-a7600046f921)",
    );
  });

  it("升序游标不会跳过同一时间的后续 ID", () => {
    expect(ascendingTimestampFilter("joined_at", "user_id", cursor)).toBe(
      "joined_at.gt.2026-07-25T06:20:12.101435+00:00,and(joined_at.eq.2026-07-25T06:20:12.101435+00:00,user_id.gt.0ea21e54-763a-4bbf-a72d-a7600046f921)",
    );
  });

  it("合并分页结果时移除边界重复项", () => {
    expect(
      mergeUniqueById(
        [{ id: "a" }, { id: "b" }],
        [{ id: "b" }, { id: "c" }],
      ),
    ).toEqual([{ id: "a" }, { id: "b" }, { id: "c" }]);
  });
});

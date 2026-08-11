import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  new URL("../../supabase/migrations/202608080002_v13_entry_drafts.sql", import.meta.url),
  "utf8",
);

describe("v1.3 entry drafts migration", () => {
  it("将未发布内容隔离在 owner-only RLS 表中", () => {
    expect(sql).toContain("create table if not exists public.entry_drafts");
    expect(sql).toContain("alter table public.entry_drafts enable row level security");
    expect(sql).toContain("using (user_id = (select auth.uid()))");
    expect(sql).toContain("revoke all on table public.entry_drafts from public, anon, authenticated");
    expect(sql).toContain("grant select on table public.entry_drafts to authenticated");
    expect(sql).not.toMatch(/create policy[\s\S]*for insert/i);
  });

  it("写入、发布和丢弃只能经过加固 RPC", () => {
    for (const name of ["save_entry_draft", "publish_entry_draft", "discard_entry_draft"]) {
      expect(sql).toContain(`function public.${name}`);
    }
    expect(sql.match(/security definer/g)?.length).toBe(3);
    expect(sql.match(/set search_path = ''/g)?.length).toBeGreaterThanOrEqual(4);
    expect(sql).toContain("grant execute on function public.save_entry_draft");
    expect(sql).toContain("to authenticated");
  });

  it("用 revision 与源故事快照阻止旧请求覆盖新内容", () => {
    expect(sql).toContain("existing.revision <> p_expected_revision");
    expect(sql).toContain("current_source_updated is distinct from draft.source_updated_at");
    expect(sql).toContain("errcode = '40001'");
    expect(sql).toContain("for update");
  });

  it("发布后清除未发布正文并复用既有受控写入 RPC", () => {
    expect(sql).toContain("public.create_entry_v11");
    expect(sql).toContain("public.update_entry_v11");
    expect(sql).toMatch(/status = 'published',[\s\S]*payload = null,[\s\S]*tag_input = ''/);
  });
});

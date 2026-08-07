"use client";

import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/navigation/app-header";
import { useAuth } from "@/components/providers/auth-provider";
import { ProtectedState } from "@/components/layout/protected-state";
import { GroupForm } from "@/components/groups/group-form";
import { createGroup } from "@/lib/data/groups";
import { getFriendlyError } from "@/lib/errors";
import { useState } from "react";

export function NewGroupView() {
  const { user, loading, configured } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  return (
    <main className="content-page">
      <AppHeader />
      <div className="narrow-container">
        <div className="page-heading"><div><p className="eyebrow">NEW CIRCLE</p><h1>创建群组</h1><p>为一群共享地点与记忆的人，留出一块安静空间。</p></div></div>
        {!configured ? <ProtectedState kind="config" /> : loading ? <ProtectedState kind="loading" /> : !user ? <ProtectedState kind="signed-out" nextPath="/groups/new" signedOutDescription="登录后可以创建任何人都能发现，或仅限邀请加入的群组。" /> : (
          <>
            {error ? <div className="inline-error" role="alert">{error}</div> : null}
            <GroupForm
              key={user.id}
              submitLabel="创建群组"
              onSubmit={async (values) => {
                setError(null);
                try {
                  const group = await createGroup(user.id, values);
                  router.push(`/groups/${group.slug}`);
                } catch (submitError) {
                  setError(getFriendlyError(submitError, "群组创建失败，请检查群组地址是否已被使用。"));
                }
              }}
            />
          </>
        )}
      </div>
    </main>
  );
}

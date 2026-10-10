import type { UserPort } from "../../types";

export const httpUser: UserPort = {
  async id() {
    const res = await fetch("/api/user");
    if (!res.ok) throw new Error("user capability failed");
    return ((await res.json()) as { id: string }).id;
  },
};

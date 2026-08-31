import type { AccountId, CloudWorkspaceId, HostId } from "./core.js";

export type ThreadId = string;
export type ProjectId = string;
export type TurnId = string;
export type ConversationItemId = string;

/** A routable thread identity. A bare thread ID is never accepted by the API. */
export type ThreadLocator =
  | {
      readonly scope: "execution";
      readonly hostId: HostId;
      readonly threadId: ThreadId;
    }
  | {
      readonly scope: "cloud";
      readonly accountId: AccountId;
      readonly workspaceId?: CloudWorkspaceId;
      readonly threadId: ThreadId;
    }
  | {
      readonly scope: "shared";
      readonly shareId: string;
      readonly threadId: ThreadId;
    };

/** A routable project identity. */
export type ProjectLocator =
  | {
      readonly scope: "execution";
      readonly hostId: HostId;
      readonly projectId: ProjectId;
    }
  | {
      readonly scope: "cloud";
      readonly accountId: AccountId;
      readonly workspaceId?: CloudWorkspaceId;
      readonly projectId: ProjectId;
    };

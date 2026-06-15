export type WorkspaceType = "business" | "personal" | "household";

export function isBusinessWorkspace(workspaceType?: WorkspaceType | null) {
  return workspaceType === "business";
}

type OverlapMember = {
  userId: string;
  schedule: Record<string, string>;
};

export function isOffOrVac(shift?: string) {
  return shift === "OFF" || shift === "VAC";
}

export function haveSameIds(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  const aSet = new Set(a);
  for (const id of b) {
    if (!aSet.has(id)) return false;
  }
  return true;
}

export function computeSelectedCommonOffDays({
  month,
  mySchedule,
  members,
  selectedIds,
}: {
  month: string;
  mySchedule: Record<string, string>;
  members: OverlapMember[];
  selectedIds: string[];
}) {
  if (selectedIds.length === 0) return [];

  const selectedIdSet = new Set(selectedIds);
  const selectedMembers = members.filter((member) => selectedIdSet.has(member.userId));
  if (selectedMembers.length === 0) return [];

  const monthPrefix = `${month}-`;
  return Object.entries(mySchedule)
    .filter(([date, shift]) => date.startsWith(monthPrefix) && isOffOrVac(shift))
    .map(([date]) => date)
    .filter((date) => selectedMembers.every((member) => isOffOrVac(member.schedule[date])))
    .sort();
}

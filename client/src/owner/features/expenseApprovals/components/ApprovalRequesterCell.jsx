// Utils
import { fullName, initials } from "../utils/approvalSummary";

// So'rovchi - inisial avatar + F.I.Sh. + login.
const ApprovalRequesterCell = ({ user }) => (
  <div className="flex min-w-0 items-center gap-2">
    <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
      {initials(user)}
    </span>
    <div className="min-w-0">
      <p className="truncate text-sm">{fullName(user)}</p>
      {user?.username && (
        <p className="truncate text-xs text-muted-foreground">{user.username}</p>
      )}
    </div>
  </div>
);

export default ApprovalRequesterCell;

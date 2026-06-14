export interface NotificationEvent {
  prNodeId: string;
  prNumber: number;
  prTitle: string;
  prUrl: string;
  repoFullName: string;
  repoOwner: string;
  author: string;
  recipients: string[];
}

export interface PullRequestPayload {
  action: string;
  pull_request: {
    node_id: string;
    number: number;
    title: string;
    html_url: string;
    user: { login: string };
    requested_reviewers?: { login: string }[];
  };
  repository: {
    full_name: string;
    owner: { login: string };
  };
  requested_reviewer?: { login: string };
  requested_team?: { name: string };
}

function buildEvent(
  payload: PullRequestPayload,
  recipients: string[]
): NotificationEvent {
  const pr = payload.pull_request;
  return {
    prNodeId: pr.node_id,
    prNumber: pr.number,
    prTitle: pr.title,
    prUrl: pr.html_url,
    repoFullName: payload.repository.full_name,
    repoOwner: payload.repository.owner.login,
    author: pr.user.login,
    recipients,
  };
}

export function parseEvent(
  action: string,
  payload: PullRequestPayload
): NotificationEvent | null {
  if (action === "review_requested") {
    const login = payload.requested_reviewer?.login;
    return login ? buildEvent(payload, [login]) : null;
  }
  if (action === "ready_for_review") {
    const recipients = (payload.pull_request.requested_reviewers ?? []).map(
      (r) => r.login
    );
    return recipients.length > 0 ? buildEvent(payload, recipients) : null;
  }
  return null;
}

import { agentDetection } from "$lib/stores/agentDetection.svelte";
import { sessionStatus } from "$lib/stores/sessions.svelte";
import { forgetInjection } from "$lib/terminal/promptInjection";
import { releaseSession } from "$lib/terminal/session-lifecycle";
import { closeSession } from "$lib/ipc/pty";
import { actionErrors } from "$lib/stores/actionErrors.svelte";

/**
 * Releases runtime state that belongs to a terminal session when its owner is
 * deleted. Keep lifecycle cleanup at this boundary so data stores do not need
 * to import terminal-pool implementation details.
 */
export function cleanupSessionRuntime(sessionId: string): void {
  if (releaseSession(sessionId)) {
    void closeSession(sessionId).catch((reason: unknown) => actionErrors.report(reason));
  }
  agentDetection.deactivate(sessionId);
  agentDetection.forget(sessionId);
  sessionStatus.forget(sessionId);
  forgetInjection(sessionId);
}

import { agentDetection } from "$lib/stores/agentDetection.svelte";
import { sessionStatus } from "$lib/stores/sessions.svelte";
import { forgetInjection } from "$lib/terminal/promptInjection";
import { releaseSession } from "$lib/terminal/session-lifecycle";

/**
 * Releases runtime state that belongs to a terminal session when its owner is
 * deleted. Keep lifecycle cleanup at this boundary so data stores do not need
 * to import terminal-pool implementation details.
 */
export function cleanupSessionRuntime(sessionId: string): void {
  releaseSession(sessionId);
  agentDetection.deactivate(sessionId);
  agentDetection.forget(sessionId);
  sessionStatus.forget(sessionId);
  forgetInjection(sessionId);
}

import { useRef, useEffect } from 'react';
import {
  type AnimationPlaybackControls,
  type ValueAnimationTransition,
  animate,
  useMotionValue,
} from 'motion/react';

/**
 * Matches LiveKit AgentState strings so the component can accept them directly.
 * We also accept our own VoiceAssistantStatus values and map them.
 */
export type WaveAgentState =
  | 'disconnected'
  | 'connecting'
  | 'initializing'
  | 'listening'
  | 'thinking'
  | 'speaking'
  // Jait-specific extras (mapped internally)
  | 'connected'
  | 'reconnecting'
  | 'error';

const DEFAULT_SPEED = 5;
const DEFAULT_AMPLITUDE = 0.07;
const DEFAULT_FREQUENCY = 12;
const DEFAULT_TRANSITION: ValueAnimationTransition = { duration: 0.2, ease: 'easeOut' };

export interface UseAgentAudioVisualizerWaveArgs {
  state?: WaveAgentState;
}

/**
 * Drive wave shader uniforms entirely via motion values (no React state / re-renders).
 *
 * Returns an object whose `.get()` values update every frame via motion's internal
 * scheduler — the consuming component only re-renders on actual state *transitions*,
 * not on every animation tick.
 */
export function useAgentAudioVisualizerWave({
  state,
}: UseAgentAudioVisualizerWaveArgs) {
  const speed = useMotionValue(DEFAULT_SPEED);
  const amplitude = useMotionValue(DEFAULT_AMPLITUDE);
  const frequency = useMotionValue(DEFAULT_FREQUENCY);
  const opacity = useMotionValue(1.0);

  // Keep animation handles so we can cancel in-flight animations
  const ctrlsRef = useRef<AnimationPlaybackControls[]>([]);

  const cancelAll = () => {
    for (const c of ctrlsRef.current) c.stop();
    ctrlsRef.current = [];
  };

  // Map Jait-specific states to canonical ones for the switch
  const canonical = state === 'connected' || state === 'reconnecting'
    ? 'connecting'
    : state === 'error'
      ? 'disconnected'
      : state;

  useEffect(() => {
    cancelAll();
    const ctrls: AnimationPlaybackControls[] = [];

    switch (canonical) {
      case 'disconnected':
        speed.set(DEFAULT_SPEED);
        ctrls.push(animate(amplitude, 0, DEFAULT_TRANSITION));
        ctrls.push(animate(frequency, 0, DEFAULT_TRANSITION));
        ctrls.push(animate(opacity, 1.0, DEFAULT_TRANSITION));
        break;
      case 'listening':
        speed.set(DEFAULT_SPEED);
        ctrls.push(animate(amplitude, DEFAULT_AMPLITUDE, DEFAULT_TRANSITION));
        ctrls.push(animate(frequency, DEFAULT_FREQUENCY, DEFAULT_TRANSITION));
        ctrls.push(animate(opacity, [1.0, 0.3], {
          duration: 0.75,
          repeat: Infinity,
          repeatType: 'mirror',
        }));
        break;
      case 'thinking':
      case 'connecting':
      case 'initializing':
        speed.set(DEFAULT_SPEED * 4);
        ctrls.push(animate(amplitude, DEFAULT_AMPLITUDE / 2, DEFAULT_TRANSITION));
        ctrls.push(animate(frequency, DEFAULT_FREQUENCY * 3, DEFAULT_TRANSITION));
        ctrls.push(animate(opacity, [1.0, 0.3], {
          duration: 0.4,
          repeat: Infinity,
          repeatType: 'mirror',
        }));
        break;
      case 'speaking':
      default:
        speed.set(DEFAULT_SPEED * 2);
        // Continuously oscillate amplitude & frequency to simulate speech volume.
        // This runs entirely inside motion's scheduler — zero React re-renders.
        ctrls.push(animate(amplitude, [0.04, 0.18, 0.08, 0.22, 0.06, 0.16], {
          duration: 2.4,
          repeat: Infinity,
          repeatType: 'mirror',
          ease: 'easeInOut',
        }));
        ctrls.push(animate(frequency, [16, 52, 28, 60, 20, 44], {
          duration: 2.8,
          repeat: Infinity,
          repeatType: 'mirror',
          ease: 'easeInOut',
        }));
        ctrls.push(animate(opacity, 1.0, DEFAULT_TRANSITION));
        break;
    }

    ctrlsRef.current = ctrls;
    return cancelAll;
  }, [canonical, speed, amplitude, frequency, opacity]);

  return { speed, amplitude, frequency, opacity };
}

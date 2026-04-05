import { useEffect, useRef, useMemo, useCallback } from 'react'
import type { VoiceAssistantState } from '@jait/shared'
import { ReactShaderToy } from '@/components/react-shader-toy'
import { cn } from '@/lib/utils'

// ── Shader source (from LiveKit agents-ui) ──────────────────────

const DEFAULT_COLOR = '#1FD5F9'

function hexToRgb(hexColor: string) {
  try {
    const m = hexColor.match(/^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/)
    if (m) return [m[1], m[2], m[3]].map((c = '00') => parseInt(c, 16) / 255)
  } catch {}
  return hexToRgb(DEFAULT_COLOR)
}

const shaderSource = `
const float TAU = 6.283185;

vec2 randFibo(vec2 p) {
  p = fract(p * vec2(443.897, 441.423));
  p += dot(p, p.yx + 19.19);
  return fract((p.xx + p.yx) * p.xy);
}

vec3 Tonemap(vec3 x) {
  x *= 4.0;
  return x / (1.0 + x);
}

float luma(vec3 color) {
  return dot(color, vec3(0.299, 0.587, 0.114));
}

vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  float e = 1.0e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

float sdCircle(vec2 st, float r) { return length(st) - r; }

vec2 turb(vec2 pos, float t, float it) {
  mat2 rotation = mat2(0.6, -0.25, 0.25, 0.9);
  mat2 layerRotation = mat2(0.6, -0.8, 0.8, 0.6);

  float frequency = mix(2.0, 15.0, uFrequency);
  float amplitude = uAmplitude;
  float frequencyGrowth = 1.4;
  float animTime = t * 0.1 * uSpeed;

  const int LAYERS = 4;
  for(int i = 0; i < LAYERS; i++) {
    vec2 rotatedPos = pos * rotation;
    vec2 wave = sin(frequency * rotatedPos + float(i) * animTime + it);
    pos += (amplitude / frequency) * rotation[0] * wave;
    rotation *= layerRotation;
    amplitude *= mix(1.0, max(wave.x, wave.y), uVariance);
    frequency *= frequencyGrowth;
  }
  return pos;
}

const float ITERATIONS = 36.0;

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / iResolution.xy;
  vec3 pp = vec3(0.0), bloom = vec3(0.0);
  float t = iTime * 0.5;
  vec2 pos = uv - 0.5;

  vec2 prevPos = turb(pos, t, 0.0 - 1.0 / ITERATIONS);
  float spacing = mix(1.0, TAU, uSpacing);

  for(float i = 1.0; i < ITERATIONS + 1.0; i++) {
    float iter = i / ITERATIONS;
    vec2 st = turb(pos, t, iter * spacing);
    float d = abs(sdCircle(st, uScale));
    float pd = distance(st, prevPos);
    prevPos = st;
    float dynamicBlur = exp2(pd * 2.0 * 1.4426950408889634) - 1.0;
    float ds = smoothstep(0.0, uBlur * 0.05 + max(dynamicBlur * uSmoothing, 0.001), d);

    vec3 color = uColor;
    if(uColorShift > 0.01) {
      vec3 hsv = rgb2hsv(color);
      hsv.x = fract(hsv.x + (1.0 - iter) * uColorShift * 0.3);
      color = hsv2rgb(hsv);
    }

    float invd = 1.0 / max(d + dynamicBlur, 0.001);
    pp += (ds - 1.0) * color;
    bloom += clamp(invd, 0.0, 250.0) * color;
  }
  pp *= 1.0 / ITERATIONS;

  bloom = bloom / (bloom + 2e4);
  vec3 color = (-pp + bloom * 3.0 * uBloom) * 1.2;
  color += (randFibo(fragCoord).x - 0.5) / 255.0;
  color = Tonemap(color);
  float alpha = luma(color) * uMix;
  fragColor = vec4(color * uMix, alpha);
}`

// ── Animated value with spring-like easing via RAF ──────────────

interface AuraParams {
  speed: number
  scale: number
  amplitude: number
  frequency: number
  brightness: number
  brightnessPulse: [number, number] | null  // [lo, hi] for pulsing, null for static
}

function getTargetForState(status: VoiceAssistantState['status'], speaking: boolean): AuraParams {
  if (speaking) {
    return { speed: 70, scale: 0.3, amplitude: 0.75, frequency: 1.25, brightness: 1.5, brightnessPulse: null }
  }
  switch (status) {
    case 'connecting':
    case 'reconnecting':
      return { speed: 30, scale: 0.3, amplitude: 0.5, frequency: 1.0, brightness: 1.5, brightnessPulse: [0.5, 2.5] }
    case 'listening':
    case 'connected':
      return { speed: 20, scale: 0.3, amplitude: 1.0, frequency: 0.7, brightness: 1.75, brightnessPulse: [1.5, 2.0] }
    case 'thinking':
      return { speed: 30, scale: 0.3, amplitude: 0.5, frequency: 1.0, brightness: 1.5, brightnessPulse: [0.5, 2.5] }
    case 'speaking':
      return { speed: 70, scale: 0.3, amplitude: 0.75, frequency: 1.25, brightness: 1.5, brightnessPulse: null }
    case 'error':
      return { speed: 5, scale: 0.15, amplitude: 0.3, frequency: 0.3, brightness: 0.4, brightnessPulse: null }
    default:
      return { speed: 10, scale: 0.2, amplitude: 1.2, frequency: 0.4, brightness: 1.0, brightnessPulse: null }
  }
}

/**
 * Drives Aura uniforms via a ref that is mutated every animation frame.
 * ReactShaderToy reads `propsUniformsRef.current` each frame, so we
 * mutate the uniform values in-place on a parallel RAF loop.
 */
function useAuraUniforms(
  status: VoiceAssistantState['status'],
  speaking: boolean,
  color: string,
  colorShift: number,
) {
  const rgbColor = useMemo(() => hexToRgb(color), [color])

  // The uniform object that gets passed to ReactShaderToy — mutated in place.
  const uniformsRef = useRef({
    uSpeed: { type: '1f' as const, value: 10 },
    uBlur: { type: '1f' as const, value: 0.2 },
    uScale: { type: '1f' as const, value: 0.2 },
    uShape: { type: '1f' as const, value: 1.0 },
    uFrequency: { type: '1f' as const, value: 0.5 },
    uAmplitude: { type: '1f' as const, value: 1.2 },
    uBloom: { type: '1f' as const, value: 0.0 },
    uMix: { type: '1f' as const, value: 1.0 },
    uSpacing: { type: '1f' as const, value: 0.5 },
    uColorShift: { type: '1f' as const, value: colorShift },
    uVariance: { type: '1f' as const, value: 0.1 },
    uSmoothing: { type: '1f' as const, value: 1.0 },
    uMode: { type: '1f' as const, value: 0.0 },
    uColor: { type: '3fv' as const, value: rgbColor ?? [0, 0.7, 1] },
  })

  // Current interpolated values
  const currentRef = useRef({ speed: 10, scale: 0.2, amplitude: 1.2, frequency: 0.5, brightness: 1.0 })
  const targetRef = useRef<AuraParams>(getTargetForState(status, speaking))
  const rafRef = useRef(0)
  const startRef = useRef(performance.now())

  // Update target when state changes
  useEffect(() => {
    targetRef.current = getTargetForState(status, speaking)
  }, [status, speaking])

  // Update color when it changes
  useEffect(() => {
    const rgb = hexToRgb(color)
    uniformsRef.current.uColor.value = rgb ?? [0, 0.7, 1]
    uniformsRef.current.uColorShift.value = colorShift
  }, [color, colorShift])

  // Animation loop — lerp uniforms toward target every frame
  useEffect(() => {
    const tick = () => {
      const c = currentRef.current
      const t = targetRef.current
      const f = 0.06 // smooth factor (~16ms * 0.06 ≈ 1ms effective, converges in ~0.5s)
      const elapsed = (performance.now() - startRef.current) / 1000

      c.speed += (t.speed - c.speed) * f
      c.scale += (t.scale - c.scale) * f
      c.amplitude += (t.amplitude - c.amplitude) * f
      c.frequency += (t.frequency - c.frequency) * f

      // Brightness: either lerp to static target, or pulse
      if (t.brightnessPulse) {
        const [lo, hi] = t.brightnessPulse
        const pulse = (Math.sin(elapsed * 4.0) + 1) * 0.5 // ~0.64Hz
        const target = lo + (hi - lo) * pulse
        c.brightness += (target - c.brightness) * 0.15 // faster lerp for pulse
      } else {
        c.brightness += (t.brightness - c.brightness) * f
      }

      // Write directly into the uniform objects
      const u = uniformsRef.current
      u.uSpeed.value = c.speed
      u.uScale.value = c.scale
      u.uAmplitude.value = c.amplitude
      u.uFrequency.value = c.frequency
      u.uMix.value = c.brightness

      rafRef.current = requestAnimationFrame(tick)
    }

    startRef.current = performance.now()
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [])

  return uniformsRef.current
}

// ── Component ────────────────────────────────────────────────────

interface AuraVisualizerProps {
  status: VoiceAssistantState['status']
  assistantSpeaking: boolean
  color?: string
  colorShift?: number
  size?: number
  className?: string
}

export function AuraVisualizer({
  status,
  assistantSpeaking,
  color = DEFAULT_COLOR,
  colorShift = 0.05,
  size = 280,
  className,
}: AuraVisualizerProps) {
  const uniforms = useAuraUniforms(status, assistantSpeaking, color, colorShift)

  return (
    <div
      className={cn('aspect-square', className)}
      style={{ width: size, height: size, borderRadius: '50%', overflow: 'hidden' }}
    >
      <ReactShaderToy
        fs={shaderSource}
        devicePixelRatio={globalThis.devicePixelRatio ?? 1}
        uniforms={uniforms}
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  )
}

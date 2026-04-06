import { memo, useEffect, useMemo, useRef } from 'react'
import type { VoiceAssistantState } from '@jait/shared'
import { ReactShaderToy } from '@/components/react-shader-toy'
import { cn } from '@/lib/utils'

const DEFAULT_COLOR = '#1FD5F9'

function hexToRgb(hex: string) {
  try {
    const m = hex.match(/^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/)
    if (m) return [m[1], m[2], m[3]].map((c = '00') => parseInt(c, 16) / 255)
  } catch {}
  return hexToRgb(DEFAULT_COLOR)
}

// Exact shader from agents-ui wave component
const shaderSource = `
const float TAU = 6.28318530718;

vec2 randFibo(vec2 p) {
  p = fract(p * vec2(443.897, 441.423));
  p += dot(p, p.yx + 19.19);
  return fract((p.xx + p.yx) * p.xy);
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

float bellCurve(float distanceFromCenter, float maxDistance) {
  float normalizedDistance = distanceFromCenter / maxDistance;
  return pow(cos(normalizedDistance * (3.14159265359 / 4.0)), 16.0);
}

float oscilloscopeWave(float x, float centerX, float time) {
  float relativeX = x - centerX;
  float maxDistance = centerX;
  float distanceFromCenter = abs(relativeX);
  float bell = bellCurve(distanceFromCenter, maxDistance);
  float wave = sin(relativeX * uFrequency + time * uSpeed) * uAmplitude * bell;
  return wave;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / iResolution.xy;
  float centerX = 0.5;
  float centerY = 0.5;
  float x = uv.x;
  float y = uv.y;

  float pixelSize = 2.0 / (iResolution.x + iResolution.y);
  float lineWidthUV = uLineWidth * pixelSize;
  float smoothingUV = uSmoothing * pixelSize;

  const int NUM_SAMPLES = 50;
  float minDist = 1000.0;
  float sampleRange = 0.02;

  for(int i = 0; i < NUM_SAMPLES; i++) {
    float offset = (float(i) / float(NUM_SAMPLES - 1) - 0.5) * sampleRange;
    float sampleX = x + offset;
    float waveY = centerY + oscilloscopeWave(sampleX, centerX, iTime);
    vec2 wavePoint = vec2(sampleX, waveY);
    vec2 currentPoint = vec2(x, y);
    float dist = distance(currentPoint, wavePoint);
    minDist = min(minDist, dist);
  }

  float line = smoothstep(lineWidthUV + smoothingUV, lineWidthUV - smoothingUV, minDist);

  vec3 color = uColor;
  if(abs(uColorShift) > 0.01) {
    float centerBandHalfWidth = 0.2;
    float edgeBandWidth = 0.5;
    float distanceFromCenter = abs(x - centerX);
    float edgeFactor = clamp((distanceFromCenter - centerBandHalfWidth) / edgeBandWidth, 0.0, 1.0);
    vec3 hsv = rgb2hsv(color);
    hsv.x = fract(hsv.x + edgeFactor * uColorShift * 0.3);
    color = hsv2rgb(hsv);
  }

  color *= line;
  float alpha = line * uMix;
  fragColor = vec4(color * uMix, alpha);
}`

// ── State-driven uniform animation (no motion/react, no LiveKit) ─

const DEFAULT_SPEED = 5
const DEFAULT_AMPLITUDE = 0.025
const DEFAULT_FREQUENCY = 10

interface WaveTarget {
  speed: number
  amplitude: number
  frequency: number
  opacity: number
  opacityPulse: [number, number, number] | null // [lo, hi, period_seconds]
}

function getWaveTarget(status: VoiceAssistantState['status'], speaking: boolean): WaveTarget {
  if (speaking) {
    // Base values — the RAF loop adds simulated volume on top
    return { speed: DEFAULT_SPEED * 2, amplitude: DEFAULT_AMPLITUDE, frequency: DEFAULT_FREQUENCY, opacity: 1.0, opacityPulse: null }
  }
  switch (status) {
    case 'connecting':
    case 'reconnecting':
      return { speed: DEFAULT_SPEED * 4, amplitude: DEFAULT_AMPLITUDE / 4, frequency: DEFAULT_FREQUENCY * 4, opacity: 1.0, opacityPulse: [0.3, 1.0, 0.4] }
    case 'listening':
    case 'connected':
      return { speed: DEFAULT_SPEED, amplitude: DEFAULT_AMPLITUDE, frequency: DEFAULT_FREQUENCY, opacity: 1.0, opacityPulse: [0.3, 1.0, 0.75] }
    case 'thinking':
      return { speed: DEFAULT_SPEED * 4, amplitude: DEFAULT_AMPLITUDE / 4, frequency: DEFAULT_FREQUENCY * 4, opacity: 1.0, opacityPulse: [0.3, 1.0, 0.4] }
    case 'speaking':
      return { speed: DEFAULT_SPEED * 2, amplitude: DEFAULT_AMPLITUDE, frequency: DEFAULT_FREQUENCY, opacity: 1.0, opacityPulse: null }
    case 'error':
      return { speed: DEFAULT_SPEED, amplitude: 0, frequency: 0, opacity: 0.3, opacityPulse: null }
    default:
      // idle/disconnected — still show a gentle wave so it's not blank
      return { speed: DEFAULT_SPEED, amplitude: DEFAULT_AMPLITUDE, frequency: DEFAULT_FREQUENCY, opacity: 0.5, opacityPulse: null }
  }
}

function useWaveUniforms(
  status: VoiceAssistantState['status'],
  speaking: boolean,
  color: string,
  colorShift: number,
  lineWidth: number,
) {
  const rgb = useMemo(() => hexToRgb(color), [color])

  // Initialize with visible wave values, not zeros
  const uniformsRef = useRef({
    uSpeed: { type: '1f' as const, value: DEFAULT_SPEED },
    uAmplitude: { type: '1f' as const, value: DEFAULT_AMPLITUDE },
    uFrequency: { type: '1f' as const, value: DEFAULT_FREQUENCY as number },
    uMix: { type: '1f' as const, value: 1.0 },
    uLineWidth: { type: '1f' as const, value: lineWidth },
    uSmoothing: { type: '1f' as const, value: 0.5 },
    uColor: { type: '3fv' as const, value: rgb ?? [0, 0.7, 1] },
    uColorShift: { type: '1f' as const, value: colorShift },
  })

  const currentRef = useRef({ speed: DEFAULT_SPEED, amplitude: DEFAULT_AMPLITUDE, frequency: DEFAULT_FREQUENCY, opacity: 1.0 })
  const targetRef = useRef<WaveTarget>(getWaveTarget(status, speaking))
  const speakingRef = useRef(speaking)
  const rafRef = useRef(0)
  const startRef = useRef(performance.now())

  useEffect(() => {
    targetRef.current = getWaveTarget(status, speaking)
    speakingRef.current = speaking
  }, [status, speaking])

  useEffect(() => {
    uniformsRef.current.uColor.value = rgb ?? [0, 0.7, 1]
    uniformsRef.current.uColorShift.value = colorShift
    uniformsRef.current.uLineWidth.value = lineWidth
  }, [rgb, colorShift, lineWidth])

  useEffect(() => {
    const tick = () => {
      const c = currentRef.current
      const t = targetRef.current
      const f = 0.12
      const elapsed = (performance.now() - startRef.current) / 1000

      c.speed += (t.speed - c.speed) * f

      // When speaking, simulate volume-driven amplitude/frequency
      if (speakingRef.current) {
        const fakeVolume = 0.3 + 0.4 * (
          0.5 * (Math.sin(elapsed * 2.3) + 1) * 0.5 +
          0.3 * (Math.sin(elapsed * 3.7) + 1) * 0.5 +
          0.2 * (Math.sin(elapsed * 5.9) + 1) * 0.5
        )
        const ampTarget = 0.015 + 0.4 * fakeVolume
        const freqTarget = 20 + 60 * fakeVolume
        c.amplitude += (ampTarget - c.amplitude) * 0.3
        c.frequency += (freqTarget - c.frequency) * 0.3
      } else {
        c.amplitude += (t.amplitude - c.amplitude) * f
        c.frequency += (t.frequency - c.frequency) * f
      }

      if (t.opacityPulse) {
        const [lo, hi, period] = t.opacityPulse
        const pulse = (Math.sin(elapsed * Math.PI * 2 / period) + 1) * 0.5
        const target = lo + (hi - lo) * pulse
        c.opacity += (target - c.opacity) * 0.2
      } else {
        c.opacity += (t.opacity - c.opacity) * f
      }

      const u = uniformsRef.current
      u.uSpeed.value = c.speed
      u.uAmplitude.value = c.amplitude
      u.uFrequency.value = c.frequency
      u.uMix.value = c.opacity

      rafRef.current = requestAnimationFrame(tick)
    }
    startRef.current = performance.now()
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [])

  return uniformsRef.current
}

// ── Component ────────────────────────────────────────────────────

interface WaveVisualizerProps {
  status: VoiceAssistantState['status']
  assistantSpeaking: boolean
  color?: string
  colorShift?: number
  lineWidth?: number
  className?: string
}

export const WaveVisualizer = memo(function WaveVisualizer({
  status,
  assistantSpeaking,
  color = DEFAULT_COLOR,
  colorShift = 0.05,
  lineWidth = 2,
  className,
}: WaveVisualizerProps) {
  const uniforms = useWaveUniforms(status, assistantSpeaking, color, colorShift, lineWidth)

  return (
    <div
      className={cn(
        'mask-[linear-gradient(90deg,transparent_0%,black_20%,black_80%,transparent_100%)]',
        className,
      )}
    >
      <ReactShaderToy
        fs={shaderSource}
        devicePixelRatio={Math.min(globalThis.devicePixelRatio ?? 1, 1.5)}
        uniforms={uniforms}
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  )
})

export type Label = 'gpu' | 'frame' | 'mesh'

type Measurements = {
  samples: bigint[]
  perSecond: number[]
  box: HTMLElement
  nums: HTMLElement
  fps: HTMLElement
}

const measurements: Record<Label, Measurements> = {
  gpu: {
    samples: [],
    perSecond: [],
    box: document.getElementById('gpu-box')!,
    nums: document.getElementById('gpu-nums')!,
    fps: document.getElementById('gpu-fps')!
  },
  frame: {
    samples: [],
    perSecond: [],
    box: document.getElementById('frame-box')!,
    nums: document.getElementById('frame-nums')!,
    fps: document.getElementById('frame-fps')!
  },
  mesh: {
    samples: [],
    perSecond: [],
    box: document.getElementById('mesh-box')!,
    nums: document.getElementById('mesh-nums')!,
    fps: document.getElementById('mesh-fps')!
  }
}
const start = Date.now()

const SECONDS = 10
for (const { fps } of Object.values(measurements)) {
  for (let i = 0; i < SECONDS; i++) {
    fps.append(document.createElement('td'))
  }
}

/**
 * @param time In nanoseconds.
 */
export function submitSample (label: Label, time: bigint | number): void {
  if (typeof time === 'number') {
    time = BigInt(Math.trunc(time))
  }
  const measurement = measurements[label]
  measurement.samples.push(time)
  const second = Math.floor((Date.now() - start) / 1000)
  while (measurement.perSecond.length < second + 1) {
    measurement.perSecond.push(0)
  }
  measurement.perSecond[second]++

  const stats = compute(measurement.samples)
  for (const [i, fps] of measurement.perSecond.slice(-SECONDS).entries()) {
    measurement.fps.children[i].textContent = String(fps)
    ;(
      measurement.fps.children[i] as HTMLElement
    ).style.backgroundColor = `hsl(${fps * 2}, 100%, 50%)`
  }
  const range = stats.max - stats.min
  if (range > 0) {
    const left = ((stats.lowerQuartile - stats.min) / range) * 150
    const mid = ((stats.median - stats.min) / range) * 150
    const right = ((stats.upperQuartile - stats.min) / range) * 150
    measurement.box.setAttributeNS(
      null,
      'd',
      `M ${left} 0 V 20 H ${right} V 0 z M ${mid} 0 V 20`
    )
  }
  measurement.nums.textContent = `avg ${(stats.average / 1e6).toFixed(
    6
  )} ms. min ${(stats.min / 1e6).toFixed(6)} ms. med ${(
    stats.median / 1e6
  ).toFixed(6)} ms. max ${(stats.max / 1e6).toFixed(6)} ms.`
}

type Stats = {
  min: number
  lowerQuartile: number
  median: number
  upperQuartile: number
  max: number
  average: number
}

function compute (samples: bigint[]): Stats {
  let average = 0
  for (const sample of samples) {
    average += Number(sample) / samples.length
  }

  const sorted = samples.map(Number).sort((a, b) => a - b)
  const quartileIndex = Math.floor(sorted.length / 4)

  return {
    min: sorted[Math.floor(sorted.length / 60)],
    max: sorted[sorted.length - 1 - Math.floor(sorted.length / 60)],
    median:
      sorted.length % 2 === 0
        ? Number(
            sorted.length < 2
              ? 0
              : sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]
          ) / 2
        : Number(sorted[(sorted.length - 1) / 2]),
    lowerQuartile:
      sorted.length % 4 < 4
        ? Number(
            quartileIndex > 0
              ? sorted[quartileIndex - 1] + sorted[quartileIndex]
              : 0
          ) / 2
        : Number(sorted[quartileIndex]),
    upperQuartile:
      sorted.length % 4 < 4
        ? Number(
            quartileIndex > 0
              ? sorted[sorted.length - quartileIndex] +
                  sorted[sorted.length - 1 - quartileIndex]
              : 0
          ) / 2
        : Number(sorted[sorted.length - 1 - quartileIndex]),
    average
  }
}

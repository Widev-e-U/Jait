declare module '@chenglou/pretext' {
  export type WhiteSpaceMode = 'normal' | 'pre-wrap'

  export interface PrepareOptions {
    whiteSpace?: WhiteSpaceMode
  }

  export type PreparedText = unknown
  export type PreparedTextWithSegments = unknown

  export type LayoutCursor = {
    segmentIndex: number
    graphemeIndex: number
  }

  export type LayoutLineRange = {
    width: number
    start: LayoutCursor
    end: LayoutCursor
  }

  export type LayoutLine = {
    text: string
    width: number
    start: LayoutCursor
    end: LayoutCursor
  }

  export function prepare(text: string, font: string, options?: PrepareOptions): PreparedText

  export function prepareWithSegments(
    text: string,
    font: string,
    options?: PrepareOptions,
  ): PreparedTextWithSegments

  export function layout(
    prepared: PreparedText,
    width: number,
    lineHeight: number,
  ): { height: number }

  export function walkLineRanges(
    prepared: PreparedTextWithSegments,
    maxWidth: number,
    onLine: (line: LayoutLineRange) => void,
  ): number

  export function layoutNextLine(
    prepared: PreparedTextWithSegments,
    start: LayoutCursor,
    maxWidth: number,
  ): LayoutLine | null
}

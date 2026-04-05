declare module '@chenglou/pretext' {
  export type PreparedText = unknown

  export function prepare(text: string, font: string): PreparedText

  export function layout(
    prepared: PreparedText,
    width: number,
    lineHeight: number,
  ): { height: number }
}

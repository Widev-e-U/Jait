import { useState } from 'react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

export function isProjectImage(path: string) {
  return /\.(png|jpe?g|gif|webp|bmp|svg|avif|ico)$/i.test(path)
}

export function ProjectImageViewer({ src, path }: { src: string; path: string }) {
  const [zoom, setZoom] = useState(1)
  const [fit, setFit] = useState(true)
  const [fullscreen, setFullscreen] = useState(false)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [failed, setFailed] = useState(false)
  const image = <div className="flex-1 min-h-0 min-w-0 overflow-auto p-4" data-testid="image-scroll-area">
    {failed ? <p role="alert">Unable to display this image.</p> : <img src={src} alt={path.split(/[/\\]/).pop() || path}
      onError={() => setFailed(true)}
      onLoad={event => setSize({width:event.currentTarget.naturalWidth,height:event.currentTarget.naturalHeight})}
      className={fit ? 'block max-w-full max-h-full object-contain mx-auto' : 'block max-w-none'}
      style={fit ? undefined : {width:size.width * zoom,height:size.height * zoom}} />}
  </div>
  const controls = <div className="flex gap-2 items-center border-b p-2 shrink-0 overflow-x-auto">
    <Button variant="ghost" size="sm" onClick={()=>{setFit(false);setZoom(value=>Math.max(.1,value/1.25))}} aria-label="Zoom out">−</Button>
    <span>{fit ? 'Fit' : `${Math.round(zoom*100)}%`}</span>
    <Button variant="ghost" size="sm" onClick={()=>{setFit(false);setZoom(value=>Math.min(16,value*1.25))}} aria-label="Zoom in">+</Button>
    <Button variant="ghost" size="sm" onClick={()=>{setFit(false);setZoom(1)}}>Actual size</Button>
    <Button variant="ghost" size="sm" onClick={()=>setFit(true)}>Fit image</Button>
    <Button variant="ghost" size="sm" onClick={()=>setFullscreen(value=>!value)}>{fullscreen ? 'Exit fullscreen' : 'Fullscreen image'}</Button>
  </div>
  return <div className="flex h-full min-h-0 flex-col" data-testid="project-image-viewer">
    {!fullscreen && <>{controls}{image}</>}
    <Dialog open={fullscreen} onOpenChange={setFullscreen}>
      <DialogContent className="flex flex-col w-[100vw] h-[100dvh] max-w-none rounded-none p-0 gap-0">
        <DialogTitle className="sr-only">{path}</DialogTitle>
        {controls}{image}
      </DialogContent>
    </Dialog>
  </div>
}

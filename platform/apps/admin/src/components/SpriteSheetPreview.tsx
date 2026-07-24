import { useEffect, useRef, useState } from "react";

export const PET_ANIMATIONS = [
  { id: "idle", label: "待机", row: 0, frames: 6 },
  { id: "running-right", label: "向右跑", row: 1, frames: 8 },
  { id: "running-left", label: "向左跑", row: 2, frames: 8 },
  { id: "waving", label: "挥手", row: 3, frames: 4 },
  { id: "jumping", label: "跳跃", row: 4, frames: 5 },
  { id: "failed", label: "失败", row: 5, frames: 8 },
  { id: "waiting", label: "等待", row: 6, frames: 6 },
  { id: "running", label: "奔跑", row: 7, frames: 6 },
  { id: "review", label: "检查", row: 8, frames: 6 },
] as const;

export type PetAnimationId = (typeof PET_ANIMATIONS)[number]["id"];

interface Props {
  spriteSheet?: string;
  imageUrl?: string;
  name: string;
  animation?: PetAnimationId;
  size?: number;
}

export default function SpriteSheetPreview({
  spriteSheet,
  imageUrl,
  name,
  animation = "idle",
  size = 96,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!spriteSheet) return;
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const image = new Image();
    let raf = 0;
    let frame = 0;
    let lastTick = 0;
    let disposed = false;
    const selected = PET_ANIMATIONS.find((item) => item.id === animation) ?? PET_ANIMATIONS[0];

    const draw = () => {
      context.clearRect(0, 0, size, size);
      context.imageSmoothingEnabled = false;
      const sourceWidth = image.width / 8;
      const expectedCellHeight = sourceWidth * (208 / 192);
      const rowCount = Math.max(9, Math.round(image.height / expectedCellHeight));
      const sourceHeight = image.height / rowCount;
      const scale = Math.min(size / sourceWidth, size / sourceHeight);
      const width = sourceWidth * scale;
      const height = sourceHeight * scale;
      context.drawImage(
        image,
        frame * sourceWidth,
        selected.row * sourceHeight,
        sourceWidth,
        sourceHeight,
        (size - width) / 2,
        (size - height) / 2,
        width,
        height,
      );
    };
    const tick = (now: number) => {
      if (now - lastTick >= 125) {
        lastTick = now;
        frame = (frame + 1) % selected.frames;
        draw();
      }
      raf = requestAnimationFrame(tick);
    };
    image.onload = () => {
      if (disposed) return;
      setFailed(false);
      draw();
      raf = requestAnimationFrame(tick);
    };
    image.onerror = () => setFailed(true);
    image.src = spriteSheet;
    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      image.onload = null;
      image.onerror = null;
    };
  }, [animation, size, spriteSheet]);

  if (!spriteSheet) {
    return imageUrl
      ? <img src={imageUrl} alt={name} style={{ width: size, height: size, objectFit: "contain" }} />
      : <span style={{ color: "#999" }}>暂无形象</span>;
  }
  return failed
    ? <span style={{ color: "#999" }}>精灵图加载失败</span>
    : <canvas ref={canvasRef} width={size} height={size} aria-label={`${name} ${animation} 动作预览`} />;
}

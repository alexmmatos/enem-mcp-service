import { useEffect, useRef, type PointerEvent } from "react";
import styles from "../ExamApp/ExamApp.module.css";

export type DrawTool = "hand" | "pencil" | "eraser";

interface Props {
  tool: DrawTool;
  color: string;
  image: string | null;
  onChange: (image: string) => void;
}

const PENCIL_WIDTH = 2.5;
const ERASER_WIDTH = 20;

const PENCIL_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">'
  + '<path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" fill="white" stroke="black" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"/></svg>';
const PENCIL_CURSOR = `url("data:image/svg+xml,${encodeURIComponent(PENCIL_ICON)}") 2 22, crosshair`;

const ERASER_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">'
  + '<g transform="rotate(45 12 12)">'
  + '<rect x="6" y="9" width="12" height="7" rx="1.5" fill="white" stroke="black" stroke-width="1.2"/>'
  + '<rect x="6" y="9" width="12" height="3" rx="1.5" fill="#e893b6" stroke="black" stroke-width="1.2"/>'
  + '</g></svg>';
const ERASER_CURSOR = `url("data:image/svg+xml,${encodeURIComponent(ERASER_ICON)}") 12 12, cell`;

// Como o Paint: canvas raster + composição "destination-out" pra apagar de verdade os pixels sob
// o cursor. Arrasto acompanhado por listeners no window (não setPointerCapture/pointerLeave no
// próprio elemento) — mais robusto dentro do iframe do host MCP, onde captura de ponteiro no
// elemento pode falhar ou disparar "leave" cedo demais perto da borda.
export function DrawLayer({ tool, color, image, onChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const last = useRef<{ x: number; y: number } | null>(null);
  const drawing = useRef(false);
  const sized = useRef(false);

  // Alguns hosts MCP (ex.: ChatGPT, Claude) montam o iframe num tamanho zerado/errado e só
  // redimensionam depois pra caber o conteúdo — medir uma vez só no mount (como antes) deixava o
  // buffer de pixels do canvas preso nesse tamanho inicial errado, e todo traço saía fora dos
  // limites reais (nada aparecia, mesmo com pointerdown/pointermove funcionando). ResizeObserver
  // resiza de verdade sempre que o container muda, preservando o desenho já feito.
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const applySize = () => {
      const rect = container.getBoundingClientRect();
      const width = Math.round(rect.width);
      const height = Math.round(rect.height);
      if (width === 0 || height === 0) return;
      if (canvas.width === width && canvas.height === height) return;
      const ctx = canvas.getContext("2d");

      if (!sized.current) {
        sized.current = true;
        canvas.width = width;
        canvas.height = height;
        if (ctx && image) {
          const img = new Image();
          img.onload = () => ctx.drawImage(img, 0, 0);
          img.src = image;
        }
        return;
      }

      const snapshot = ctx && canvas.width > 0 && canvas.height > 0 ? ctx.getImageData(0, 0, canvas.width, canvas.height) : null;
      canvas.width = width;
      canvas.height = height;
      if (ctx && snapshot) ctx.putImageData(snapshot, 0, 0);
    };

    applySize();
    const observer = new ResizeObserver(applySize);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const pointFromClient = (clientX: number, clientY: number): { x: number; y: number } => {
    const rect = containerRef.current!.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const drawTo = (point: { x: number; y: number }) => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx || !last.current) return;
    ctx.globalCompositeOperation = tool === "eraser" ? "destination-out" : "source-over";
    ctx.lineWidth = tool === "eraser" ? ERASER_WIDTH : PENCIL_WIDTH;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    last.current = point;
  };

  const handleWindowPointerMove = (e: globalThis.PointerEvent) => {
    if (!drawing.current) return;
    drawTo(pointFromClient(e.clientX, e.clientY));
  };

  const handleWindowPointerUp = () => {
    if (drawing.current && canvasRef.current) onChange(canvasRef.current.toDataURL());
    drawing.current = false;
    last.current = null;
    window.removeEventListener("pointermove", handleWindowPointerMove);
    window.removeEventListener("pointerup", handleWindowPointerUp);
  };

  const handlePointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (tool === "hand") return;
    drawing.current = true;
    last.current = pointFromClient(e.clientX, e.clientY);
    window.addEventListener("pointermove", handleWindowPointerMove);
    window.addEventListener("pointerup", handleWindowPointerUp);
  };

  const cursor = tool === "pencil" ? PENCIL_CURSOR : ERASER_CURSOR;

  return <div
    ref={containerRef}
    className={styles.drawLayer}
    style={{ pointerEvents: tool === "hand" ? "none" : "auto", cursor }}
    onPointerDown={handlePointerDown}
  >
    <canvas ref={canvasRef} className={styles.drawCanvas} />
  </div>;
}

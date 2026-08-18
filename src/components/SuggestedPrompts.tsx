import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { motion } from 'framer-motion';

interface SuggestedPromptsProps {
  prompts: string[];
  disabled?: boolean;
  onSelect: (prompt: string) => void;
  scrollable?: boolean;
}

export function SuggestedPrompts({
  prompts,
  disabled,
  onSelect,
  scrollable = false,
}: SuggestedPromptsProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [scrollEdges, setScrollEdges] = useState({ left: false, right: false });

  const updateScrollEdges = useCallback(() => {
    const scroller = scrollRef.current;
    if (!scroller) {
      return;
    }

    const maxScrollLeft = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
    const nextEdges = {
      left: scroller.scrollLeft > 1,
      right: scroller.scrollLeft < maxScrollLeft - 1,
    };

    setScrollEdges((current) =>
      current.left === nextEdges.left && current.right === nextEdges.right
        ? current
        : nextEdges,
    );
  }, []);

  const handleWheel = useCallback(
    (event: WheelEvent) => {
      const scroller = scrollRef.current;
      if (
        !scroller ||
        event.deltaY === 0 ||
        Math.abs(event.deltaX) >= Math.abs(event.deltaY)
      ) {
        return;
      }

      const maxScrollLeft = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
      const wheelDistance =
        event.deltaMode === WheelEvent.DOM_DELTA_LINE
          ? event.deltaY * 16
          : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
            ? event.deltaY * scroller.clientWidth
            : event.deltaY;
      const nextScrollLeft = Math.max(
        0,
        Math.min(maxScrollLeft, scroller.scrollLeft + wheelDistance),
      );

      if (nextScrollLeft === scroller.scrollLeft) {
        return;
      }

      event.preventDefault();
      scroller.scrollLeft = nextScrollLeft;
      updateScrollEdges();
    },
    [updateScrollEdges],
  );

  useEffect(() => {
    if (!scrollable) {
      return undefined;
    }

    const scroller = scrollRef.current;
    if (!scroller) {
      return undefined;
    }

    const frameId = window.requestAnimationFrame(updateScrollEdges);
    const resizeObserver = new ResizeObserver(updateScrollEdges);
    resizeObserver.observe(scroller);
    scroller.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      window.cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      scroller.removeEventListener('wheel', handleWheel);
    };
  }, [handleWheel, prompts, scrollable, updateScrollEdges]);

  const promptGrid = (
    <div
      ref={scrollable ? scrollRef : undefined}
      className={`prompt-grid ${scrollable ? 'prompt-grid--scroll' : ''}`}
      onScroll={scrollable ? updateScrollEdges : undefined}
    >
      {prompts.map((prompt, index) => (
        <motion.button
          key={prompt}
          type="button"
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18, delay: index * 0.04 }}
          onClick={() => onSelect(prompt)}
          disabled={disabled}
          className="prompt-card"
        >
          <span className="prompt-card__text">{prompt}</span>
        </motion.button>
      ))}
    </div>
  );

  if (!scrollable) {
    return promptGrid;
  }

  return (
    <div
      className={`prompt-scroll-shell ${scrollEdges.left ? 'prompt-scroll-shell--left' : ''} ${scrollEdges.right ? 'prompt-scroll-shell--right' : ''}`}
    >
      {promptGrid}
    </div>
  );
}

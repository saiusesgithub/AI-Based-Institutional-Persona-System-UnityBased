"use client";

import { useEffect, useRef, useState } from "react";

export const useBlink = () => {
  const [blink, setBlink] = useState(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let mounted = true;

    const runBlink = () => {
      const duration = 140;
      const start = performance.now();

      const animate = (time: number) => {
        if (!mounted) {
          return;
        }
        const progress = Math.min((time - start) / duration, 1);
        const value = Math.sin(progress * Math.PI);
        setBlink(value);
        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          setBlink(0);
          scheduleNext();
        }
      };

      requestAnimationFrame(animate);
    };

    const scheduleNext = () => {
      const delay = 2400 + Math.random() * 2200;
      timeoutRef.current = setTimeout(runBlink, delay);
    };

    scheduleNext();

    return () => {
      mounted = false;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return blink;
};

export const useIsMobile = (breakpoint = 768) => {
  const isMobile = ref(false);

  const update = () => {
    isMobile.value = window.innerWidth < breakpoint;
  };

  onMounted(() => {
    update();
    window.addEventListener("resize", update);
  });

  onUnmounted(() => {
    window.removeEventListener("resize", update);
  });

  return isMobile;
};

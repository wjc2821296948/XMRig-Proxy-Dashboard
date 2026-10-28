/** Keyboard shortcut for the dashboard's existing manual refresh action. */
const isEditableTarget = target => {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"], [role="textbox"]'));
};

document.addEventListener("keydown", event => {
  if (event.defaultPrevented || event.repeat || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  if (event.key.toLowerCase() !== "r" || isEditableTarget(event.target)) return;
  const refreshButton = document.getElementById("refreshDashboardButton");
  if (!refreshButton || refreshButton.disabled) return;
  event.preventDefault();
  refreshButton.click();
});

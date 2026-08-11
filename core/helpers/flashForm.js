// Reads the formErrors/formData that core/middlewares/validate.js flashes on a failed web
// submission, so the re-rendered form can highlight which field was wrong and refill what the
// user typed instead of resetting everything blank.
function getFlashForm(req) {
  const rawErrors = req.flash('formErrors')[0];
  const rawData = req.flash('formData')[0];
  let formErrors = {};
  let formData = {};
  try {
    if (rawErrors) formErrors = JSON.parse(rawErrors);
  } catch {}
  try {
    if (rawData) formData = JSON.parse(rawData);
  } catch {}
  return { formErrors, formData };
}

module.exports = { getFlashForm };

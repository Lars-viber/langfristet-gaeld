import { feedbackFor } from '../validation';
import type { ValidationErrorCode } from '../validation';
import type { FeedbackContext } from '../validation/types';

export function ValidationMessage({ code, id, context = 'default' }: { code: ValidationErrorCode | null; id: string; context?: FeedbackContext }) {
  return code ? <p className="validation-message" id={id} role="alert">{feedbackFor(code, context)}</p> : null;
}

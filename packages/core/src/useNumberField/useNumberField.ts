import { Ref, computed, nextTick, shallowRef, toValue } from 'vue';
import {
  createAccessibleErrorMessageProps,
  createDescribedByProps,
  isEmpty,
  isNullOrUndefined,
  normalizeProps,
  propsToValues,
  useUniqId,
  withRefCapture,
} from '../utils/common';
import {
  AriaDescribableProps,
  AriaLabelableProps,
  InputEvents,
  AriaValidatableProps,
  Numberish,
  Reactivify,
} from '../types/common';
import { useInputValidity } from '../validation/useInputValidity';
import { useLabel } from '../a11y/useLabel';
import { useNumberParser } from '../i18n/useNumberParser';
import { useSpinButton } from '../useSpinButton';
import { useLocale } from '../i18n';
import { useFormField } from '../useFormField';
import { FieldTypePrefixes } from '../constants';
import { TypedSchema } from '../types';
import { exposeField } from '../utils/exposers';
import { useEventListener } from '../helpers/useEventListener';

export interface NumberInputDOMAttributes {
  name?: string;
}

export interface NumberInputDOMProps
  extends NumberInputDOMAttributes,
    AriaLabelableProps,
    AriaDescribableProps,
    AriaValidatableProps,
    InputEvents {
  id: string;
}

export interface NumberFieldProps {
  label: string;
  locale?: string;
  modelValue?: number;
  description?: string;

  incrementLabel?: string;
  decrementLabel?: string;

  name?: string;
  value?: Numberish;
  min?: Numberish;
  max?: Numberish;
  step?: Numberish;
  placeholder?: string | undefined;

  required?: boolean;
  readonly?: boolean;
  disabled?: boolean;

  formatOptions?: Intl.NumberFormatOptions;

  schema?: TypedSchema<number>;

  disableWheel?: boolean;
  disableHtmlValidation?: boolean;
}

export function useNumberField(
  _props: Reactivify<NumberFieldProps, 'schema'>,
  elementRef?: Ref<HTMLInputElement | HTMLTextAreaElement>,
) {
  const props = normalizeProps(_props, ['schema']);
  const inputId = useUniqId(FieldTypePrefixes.NumberField);
  const inputEl = elementRef || shallowRef<HTMLInputElement>();
  const { locale } = useLocale();
  const parser = useNumberParser(() => toValue(props.locale) ?? locale.value, props.formatOptions);
  const field = useFormField<number>({
    path: props.name,
    initialValue: toValue(props.modelValue) ?? Number(toValue(props.value)),
    disabled: props.disabled,
    schema: props.schema,
  });

  const { validityDetails, updateValidity } = useInputValidity({
    inputEl,
    field,
    disableHtmlValidation: props.disableHtmlValidation,
  });
  const { fieldValue, setValue, setTouched, errorMessage } = field;
  const formattedText = computed<string>(() => {
    if (Number.isNaN(fieldValue.value) || isEmpty(fieldValue.value)) {
      return '';
    }

    return parser.format(fieldValue.value);
  });

  const { labelProps, labelledByProps } = useLabel({
    for: inputId,
    label: props.label,
    targetRef: inputEl,
  });

  const { descriptionProps, describedByProps } = createDescribedByProps({
    inputId,
    description: props.description,
  });

  const { accessibleErrorProps, errorMessageProps } = createAccessibleErrorMessageProps({
    inputId,
    errorMessage,
  });

  const { incrementButtonProps, decrementButtonProps, increment, decrement, spinButtonProps, applyClamp } =
    useSpinButton({
      current: fieldValue,
      currentText: formattedText,
      step: props.step,
      min: props.min,
      max: props.max,
      readonly: props.readonly,
      disabled: () => toValue(props.disabled) || toValue(props.readonly),
      incrementLabel: props.incrementLabel,
      decrementLabel: props.decrementLabel,
      orientation: 'vertical',
      preventTabIndex: true,

      onChange: value => {
        setValue(value);
        setTouched(true);
        updateValidity();
      },
    });

  const handlers: InputEvents = {
    onBeforeinput: (event: InputEvent) => {
      // No data,like backspace or whatever
      if (isNullOrUndefined(event.data)) {
        return;
      }

      const el = event.target as HTMLInputElement;
      // Kind of predicts the next value of the input by appending the new data
      const nextValue =
        el.value.slice(0, el.selectionStart ?? undefined) + event.data + el.value.slice(el.selectionEnd ?? undefined);

      const isValid = parser.isValidNumberPart(nextValue);
      if (!isValid) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
    },
    onChange: (event: Event) => {
      setValue(applyClamp(parser.parse((event.target as HTMLInputElement).value)));
      nextTick(() => {
        if (inputEl.value && inputEl.value?.value !== formattedText.value) {
          inputEl.value.value = formattedText.value;
        }
      });
    },
    onBlur: () => {
      setTouched(true);
    },
  };

  const inputMode = computed(() => {
    const intlOpts = toValue(props.formatOptions);
    const step = Number(toValue(props.step)) || 1;
    const hasDecimals = (intlOpts?.maximumFractionDigits ?? 0) > 0 || String(step).includes('.');

    if (hasDecimals) {
      return 'decimal';
    }

    return 'numeric';
  });

  const inputProps = computed<NumberInputDOMProps>(() => {
    return withRefCapture(
      {
        ...propsToValues(props, ['name', 'placeholder', 'required', 'readonly', 'disabled']),
        ...labelledByProps.value,
        ...describedByProps.value,
        ...accessibleErrorProps.value,
        ...handlers,
        onKeydown: spinButtonProps.value.onKeydown,
        id: inputId,
        inputmode: inputMode.value,
        value: formattedText.value,
        max: toValue(props.max),
        min: toValue(props.min),
        type: 'text',
        spellcheck: false,
      },
      inputEl,
      elementRef,
    );
  });

  useEventListener(
    inputEl,
    'wheel',
    (e: WheelEvent) => {
      if (e.deltaY > 0) {
        increment();
        return;
      }

      decrement();
    },
    { disabled: () => toValue(props.disableWheel), passive: true },
  );

  return {
    ...exposeField(field),
    decrement,
    decrementButtonProps,
    descriptionProps,
    errorMessageProps,
    increment,
    incrementButtonProps,
    inputEl,
    inputProps,
    labelProps,
    validityDetails,
    formattedText,
  };
}

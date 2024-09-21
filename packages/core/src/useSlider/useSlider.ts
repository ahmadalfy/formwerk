import { InjectionKey, computed, onBeforeUnmount, provide, ref, toValue } from 'vue';
import { useLabel } from '../a11y/useLabel';
import { AriaLabelableProps, Arrayable, Direction, Orientation, Reactivify, TypedSchema } from '../types';
import {
  createAccessibleErrorMessageProps,
  ErrorableAttributes,
  isNullOrUndefined,
  normalizeArrayable,
  normalizeProps,
  removeFirst,
  useUniqId,
  withRefCapture,
} from '../utils/common';
import { toNearestMultipleOf } from '../utils/math';
import { useLocale } from '../i18n/useLocale';
import { useFormField } from '../useFormField';
import { FieldTypePrefixes } from '../constants';
import { exposeField } from '../utils/exposers';
import { useInputValidity } from '../validation';

export interface SliderProps {
  label?: string;
  name?: string;

  orientation?: Orientation;
  dir?: Direction;
  modelValue?: number | number[];
  min?: number;
  max?: number;
  step?: number;

  disabled?: boolean;
  readonly?: boolean;

  schema?: TypedSchema<number>;
}

export type Coordinate = { x: number; y: number };

export interface ThumbRegistration {
  id: string;
  focus(): void;
}

export interface ValueRange {
  min: number;
  max: number;
}

export interface SliderRegistration {
  /**
   * Gets the available range of values for the thumb that this registration is associated with.
   */
  getThumbRange(): ValueRange;

  /**
   * Gets the range for the slider.
   */
  getSliderRange(): ValueRange;

  /**
   * Gets the step value for the slider.
   */
  getSliderStep(): number;

  /**
   * Gets the props labelling the slider.
   */
  getSliderLabelProps(): AriaLabelableProps;

  /**
   * Gets the slider current orientation.
   */
  getOrientation(): Orientation;

  /**
   * Gets the value for a given page position.
   */
  getValueForPagePosition(position: Coordinate): number;

  /**
   * Gets the inline direction of the slider.
   */
  getInlineDirection(): Direction;

  /**
   * Gets the current value of the thumb.
   */
  getThumbValue(): number;

  /**
   * Gets the index of the thumb.
   */
  getIndex(): number;

  /**
   * Sets the value of the thumb.
   */
  setThumbValue(value: number): void;

  setTouched(value: boolean): void;

  isDisabled(): boolean;

  getAccessibleErrorProps(): ErrorableAttributes;
}

export interface SliderContext {
  useSliderThumbRegistration(ctx: ThumbRegistration): SliderRegistration;
}

export const SliderInjectionKey: InjectionKey<SliderContext> = Symbol('Slider');

export function useSlider(_props: Reactivify<SliderProps, 'schema'>) {
  const props = normalizeProps(_props, ['schema']);
  const inputId = useUniqId(FieldTypePrefixes.Slider);
  const trackRef = ref<HTMLElement>();
  const thumbs = ref<ThumbRegistration[]>([]);
  const isDisabled = () => toValue(props.disabled) ?? false;
  const isReadonly = () => toValue(props.readonly) ?? false;
  const isMutable = () => !isDisabled() && !isReadonly();
  const { direction } = useLocale();
  const field = useFormField<Arrayable<number>>({
    path: props.name,
    initialValue: toValue(props.modelValue),
    disabled: props.disabled,
    schema: props.schema,
  });

  const { fieldValue, setValue, setTouched } = field;
  const { updateValidity } = useInputValidity({ field });
  const { labelProps, labelledByProps } = useLabel({
    for: inputId,
    label: props.label,
    targetRef: trackRef,
    handleClick: () => thumbs.value[0]?.focus(),
  });

  const { errorMessageProps, accessibleErrorProps } = createAccessibleErrorMessageProps({
    inputId,
    errorMessage: field.errorMessage,
  });

  const groupProps = computed(() => ({
    ...labelledByProps.value,
    id: inputId,
    role: 'group',
    dir: toValue(props.dir),
  }));

  function getThumbValue(idx: number) {
    if (Array.isArray(fieldValue.value)) {
      return fieldValue.value[idx];
    }

    if (idx === 0) {
      return fieldValue.value;
    }

    return undefined;
  }

  function setThumbValue(idx: number, value: number) {
    if (!isMutable()) {
      return;
    }

    if (thumbs.value.length <= 1) {
      setValue(value);
      updateValidity();
      return;
    }

    const nextValue = normalizeArrayable(fieldValue.value).filter(v => !isNullOrUndefined(v));
    nextValue[idx] = value;
    setValue(nextValue);
    updateValidity();
  }

  const trackProps = computed(() => {
    const isVertical = toValue(props.orientation) === 'vertical';

    return withRefCapture(
      {
        style: { 'container-type': isVertical ? 'size' : 'inline-size', position: 'relative' },
        onMousedown(e: MouseEvent) {
          if (!trackRef.value || !isMutable()) {
            return;
          }

          const targetValue = getValueForPagePosition({ x: e.clientX, y: e.clientY });
          const closest = thumbs.value.reduce(
            (candidate, curr, idx) => {
              const { min, max } = getThumbRange(curr);
              if (targetValue < min || targetValue > max) {
                return candidate;
              }

              const currentThumbValue = getThumbValue(idx);
              if (isNullOrUndefined(currentThumbValue)) {
                return candidate;
              }

              const diff = Math.abs(currentThumbValue - targetValue);

              return diff < candidate.diff ? { thumb: curr, diff, idx } : candidate;
            },
            { thumb: thumbs.value[0], idx: 0, diff: Infinity },
          );

          setThumbValue(closest.idx, targetValue);
          setTouched(true);
        },
      },
      trackRef,
    );
  });

  function getValueForPagePosition({ x, y }: Coordinate) {
    if (!trackRef.value) {
      return 0;
    }

    const orientation = toValue(props.orientation) || 'horizontal';
    const rect = trackRef.value.getBoundingClientRect();
    let percent = orientation === 'horizontal' ? (x - rect.left) / rect.width : (y - rect.top) / rect.height;
    if (toValue(props.dir) === 'rtl' || orientation === 'vertical') {
      percent = 1 - percent;
    }

    const min = toValue(props.min) || 0;
    const max = toValue(props.max) || 100;

    const value = percent * (max - min) + min;

    return toNearestMultipleOf(value, toValue(props.step) || 1);
  }

  function getSliderRange() {
    return { min: toValue(props.min) || 0, max: toValue(props.max) || 100 };
  }

  function getThumbRange(thumbCtx: ThumbRegistration) {
    const { min: absoluteMin, max: absoluteMax } = getSliderRange();

    const idx = thumbs.value.indexOf(thumbCtx);
    const nextThumb = getThumbValue(idx + 1);
    const prevThumb = getThumbValue(idx - 1);

    const min = prevThumb ?? absoluteMin;
    const max = nextThumb ?? absoluteMax;

    return { min, max, absoluteMin, absoluteMax };
  }

  function useSliderThumbRegistration(ctx: ThumbRegistration) {
    const id = ctx.id;
    thumbs.value.push(ctx);

    onBeforeUnmount(() => {
      removeFirst(thumbs.value, reg => reg.id === id);
    });

    function getThumbIndex() {
      return thumbs.value.findIndex(t => t.id === id);
    }

    // Each thumb range is dependent on the previous and next thumb
    // i.e it's min cannot be less than the previous thumb's value
    // and it's max cannot be more than the next thumb's value
    const reg: SliderRegistration = {
      getThumbRange: () => getThumbRange(ctx),
      getSliderRange,
      getSliderStep() {
        return toValue(props.step) || 1;
      },
      getSliderLabelProps() {
        return labelledByProps.value;
      },
      getValueForPagePosition,
      getOrientation: () => toValue(props.orientation) || 'horizontal',
      getInlineDirection: () => toValue(props.dir) || direction.value,
      getIndex: getThumbIndex,
      getThumbValue: () => {
        const { absoluteMin } = getThumbRange(ctx);

        return getThumbValue(getThumbIndex()) ?? absoluteMin;
      },
      setThumbValue(value) {
        setThumbValue(getThumbIndex(), value);
      },
      setTouched,
      isDisabled,
      getAccessibleErrorProps: () => accessibleErrorProps.value,
    };

    return reg;
  }

  // TODO: IDK what this does
  const outputProps = {
    'aria-live': 'off',
  };

  provide(SliderInjectionKey, { useSliderThumbRegistration });

  return {
    trackRef,
    labelProps,
    groupProps,
    outputProps,
    trackProps,
    errorMessageProps,
    ...exposeField(field),
  };
}

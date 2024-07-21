import { ref } from 'vue';
import { useInputValidity } from './useInputValidity';
import { fireEvent, render, screen } from '@testing-library/vue';

test('updates the validity state on blur events', async () => {
  const input = ref<HTMLInputElement>();

  await render({
    setup: () => {
      const { errorMessage } = useInputValidity(input);

      return { input, errorMessage };
    },
    template: `
      <form>
        <input ref="input" data-testid="input" required />
        <span data-testid="err">{{ errorMessage }}</span>
      </form>
    `,
  });

  await fireEvent.blur(screen.getByTestId('input'));
  expect(screen.getByTestId('err').textContent).toBe('Constraints not satisfied');
});

test('updates the validity state on change events', async () => {
  const input = ref<HTMLInputElement>();

  await render({
    setup: () => {
      const { errorMessage } = useInputValidity(input);

      return { input, errorMessage };
    },
    template: `
      <form>
        <input ref="input" data-testid="input" required />
        <span data-testid="err">{{ errorMessage }}</span>
      </form>
    `,
  });

  await fireEvent.change(screen.getByTestId('input'));
  expect(screen.getByTestId('err').textContent).toBe('Constraints not satisfied');
  await fireEvent.change(screen.getByTestId('input'), { target: { value: 'test' } });
  expect(screen.getByTestId('err').textContent).toBe('');
});

test('updates the validity on specified events', async () => {
  const input = ref<HTMLInputElement>();

  await render({
    setup: () => {
      const { errorMessage } = useInputValidity(input, { events: ['input'] });

      return { input, errorMessage };
    },
    template: `
      <form>
        <input ref="input" data-testid="input" required />
        <span data-testid="err">{{ errorMessage }}</span>
      </form>
    `,
  });

  await fireEvent.input(screen.getByTestId('input'));
  expect(screen.getByTestId('err').textContent).toBe('Constraints not satisfied');
  await fireEvent.input(screen.getByTestId('input'), { target: { value: 'test' } });
  expect(screen.getByTestId('err').textContent).toBe('');
});

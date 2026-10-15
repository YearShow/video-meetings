// redirect() и notFound() реализованы исключениями: их нельзя глотать в catch.
export function isNextControlFlow(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'digest' in error &&
    typeof error.digest === 'string' &&
    error.digest.startsWith('NEXT_')
  );
}

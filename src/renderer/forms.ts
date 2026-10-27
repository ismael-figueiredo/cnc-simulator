/** A number field's value, or undefined when it is left empty (the default applies). */
export const optionalNumber = (value: string): number | undefined => (value === '' ? undefined : Number(value))

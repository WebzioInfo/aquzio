/**
 * Converts numbers to Indian currency words format.
 * E.g., 15420.50 => "Rupees Fifteen Thousand Four Hundred Twenty and Fifty Paise Only"
 */
export const convertNumberToIndianWords = (amount: number): string => {
  if (isNaN(amount) || amount === 0) return 'Rupees Zero Only'

  const wholePart = Math.floor(Math.abs(amount))
  const paisePart = Math.round((Math.abs(amount) - wholePart) * 100)

  const units = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
    'Seventeen', 'Eighteen', 'Nineteen'
  ]
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

  const convertTwoDigits = (n: number): string => {
    if (n < 20) return units[n]
    const t = tens[Math.floor(n / 10)]
    const u = units[n % 10]
    return u ? `${t} ${u}` : t
  }

  const convertThreeDigits = (n: number): string => {
    const h = Math.floor(n / 100)
    const rem = n % 100
    let str = ''
    if (h > 0) str += `${units[h]} Hundred`
    if (rem > 0) {
      if (str) str += ' and '
      str += convertTwoDigits(rem)
    }
    return str
  }

  const parts: string[] = []
  let n = wholePart

  // Crores (10,000,000)
  const crores = Math.floor(n / 10000000)
  if (crores > 0) {
    parts.push(`${convertNumberToIndianWordsInner(crores)} Crore`)
    n %= 10000000
  }

  // Lakhs (100,000)
  const lakhs = Math.floor(n / 100000)
  if (lakhs > 0) {
    parts.push(`${convertTwoDigits(lakhs)} Lakh`)
    n %= 100000
  }

  // Thousands (1,000)
  const thousands = Math.floor(n / 1000)
  if (thousands > 0) {
    parts.push(`${convertTwoDigits(thousands)} Thousand`)
    n %= 1000
  }

  // Hundreds and units
  if (n > 0) {
    parts.push(convertThreeDigits(n))
  }

  function convertNumberToIndianWordsInner(num: number): string {
    const p: string[] = []
    const cr = Math.floor(num / 10000000)
    if (cr > 0) p.push(`${convertTwoDigits(cr)} Crore`)
    const rem = num % 10000000
    const lk = Math.floor(rem / 100000)
    if (lk > 0) p.push(`${convertTwoDigits(lk)} Lakh`)
    const th = Math.floor((rem % 100000) / 1000)
    if (th > 0) p.push(`${convertTwoDigits(th)} Thousand`)
    const rest = rem % 1000
    if (rest > 0) p.push(convertThreeDigits(rest))
    return p.join(' ')
  }

  let words = parts.join(' ').trim()
  if (!words) words = 'Zero'

  let result = `Rupees ${words}`
  if (paisePart > 0) {
    result += ` and ${convertTwoDigits(paisePart)} Paise`
  }
  return `${result} Only`
}

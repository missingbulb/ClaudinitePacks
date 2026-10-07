// The cn a pack's test asks. CLAUDINITE_CN names the binary; with none, a test passing
// `needsCn` as its options is skipped rather than failed, so the suite still runs
// where no cn is built.
export const CN = process.env.CLAUDINITE_CN || null;

export const needsCn = CN ? {} : { skip: 'CLAUDINITE_CN names no cn binary' };

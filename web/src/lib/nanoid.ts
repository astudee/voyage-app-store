import { customAlphabet } from 'nanoid';

const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const generateNanoId = customAlphabet(alphabet, 10);

export async function generateDocumentId(checkExists: (id: string) => Promise<boolean>): Promise<string> {
  let id = generateNanoId();
  let attempts = 0;

  while (await checkExists(id) && attempts < 5) {
    console.log(`[nanoid] Collision for ${id}, regenerating...`);
    id = generateNanoId();
    attempts++;
  }

  if (attempts >= 5) {
    throw new Error('Failed to generate unique ID');
  }

  return id;
}

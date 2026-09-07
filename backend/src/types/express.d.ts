declare global {
  namespace Express {
    interface Request {
      id: string;
      auth?: { userId: string };
    }
  }
}

export {};

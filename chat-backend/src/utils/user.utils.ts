interface UserDocumentLike {
    _id: { toString(): string };
    toJSON(): Record<string, unknown>;
}

export const sanitizeUser = (user: UserDocumentLike): Record<string, unknown> & { id: string; _id: unknown } => {
    const raw = user.toJSON();
    delete raw.password;
    delete raw.__v;
    return { id: user._id.toString(), _id: user._id, ...raw };
};

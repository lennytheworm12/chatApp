//merge userId into request type 
//available at all times to our interpreter but userId will only exist after decoding
declare global {
    namespace Express {
        interface Request {
            userId?: string;
        }
    }
}

export { };

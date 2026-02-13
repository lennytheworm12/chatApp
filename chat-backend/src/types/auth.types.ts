//define common auth types we will be using


export interface RegisterData {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    image?: string;//stores an address to the image i think
    color : string;

}


export interface LoginData {

    email: string;
    password: string;
}


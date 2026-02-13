//create the model for the user in the database

//user needs to have _id (indexing im guessing), password, firstName, lastName, image, color, profileSetup
import { Schema } from 'mongoose';
import { model } from 'mongoose';
//define the interface of our user for type def clarity
interface UserInterface {
    // _id: string; this is auto assigned
    email: string;
    password: string, //i heard its good to have everything option in web dev since fields can be missing all the time
    firstName?: string;
    lastName?: string;
    image?: string;
    color?: string;
    profileSetup: boolean;

}


const userSchema = new Schema<UserInterface>({
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true, select: false },//password wont be included in queries by default
    firstName: { type: String },
    lastName: { type: String },
    image: { type: String },
    color: { type: String },
    profileSetup: { type: Boolean, default: false },

});


userSchema.methods.toJSON = function() {
    const obj = this.toObject();
    delete obj.password;
    return obj;
}

export const UserModel = model<UserInterface>('User', userSchema);


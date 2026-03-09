
import express from 'express';



import {searchForUsers} from "../controllers/contacts.searchForUsers.js";
import { verifyUser } from '../middleware/auth.middleware.js';
import {searchForAllUsers} from "../controllers/contacts.searchForAllUsers.js";
import {getContactBySortedMessages} from "../controllers/contacts.getContactsByMessages.js";
import {deleteDirectMessages} from "../controllers/contacts.deleteDmByID.js";
const router: express.Router = express.Router();



router.post('/search', verifyUser, searchForUsers); //queries the db for users using a searchTerm
router.get('/all-contacts', verifyUser, searchForAllUsers);
router.get('/get-contacts-for-list', verifyUser, getContactBySortedMessages);
router.delete('/delete-dm/:dmId',verifyUser, deleteDirectMessages);


export default router;

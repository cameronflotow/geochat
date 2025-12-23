import { db } from './firebase';
import { collection, getDocs, deleteDoc, doc, writeBatch, query, where } from 'firebase/firestore';

/**
 * Completely wipes a chat and all associated data (posts, comments, presence)
 * to ensure no orphaned data remains.
 */
/**
 * Deletes a single post and all its comments.
 */
export async function deletePostFully(chatId, postId) {
    if (!chatId || !postId) return;

    // Delete comments
    const commentsRef = collection(db, "chats", chatId, "posts", postId, "comments");
    const commentsSnap = await getDocs(commentsRef);
    await Promise.all(commentsSnap.docs.map(c => deleteDoc(c.ref)));

    // Delete post
    await deleteDoc(doc(db, "chats", chatId, "posts", postId));
}

export async function deleteChatFully(chatId) {
    if (!chatId) return;

    console.log(`Starting deep clean for chat ${chatId}...`);

    try {
        // 1. Get all posts
        const postsRef = collection(db, "chats", chatId, "posts");
        const postsSnap = await getDocs(postsRef);

        const deletePromises = postsSnap.docs.map(postSnap =>
            deletePostFully(chatId, postSnap.id)
        );

        await Promise.all(deletePromises);

        // 4. Delete Presence Data
        const presenceRef = collection(db, "chats", chatId, "presence");
        const presenceSnap = await getDocs(presenceRef);
        const presenceDeletes = presenceSnap.docs.map(p => deleteDoc(p.ref));
        await Promise.all(presenceDeletes);

        // 5. Delete the Chat Document
        await deleteDoc(doc(db, "chats", chatId));

        // 6. Delete Linked Private Conversations
        const conversationsQuery = query(
            collection(db, "conversations"),
            where("chatId", "==", chatId)
        );
        const conversationsSnap = await getDocs(conversationsQuery);
        const conversationDeletes = conversationsSnap.docs.map(c => deleteDoc(c.ref));
        await Promise.all(conversationDeletes);

        console.log(`Deep clean complete for ${chatId}`);
    } catch (error) {
        console.error("Error during deep clean:", error);
    }
}

'use client';

import { useState, useEffect } from 'react';
import { Heart, MessageCircle, Trash2, Send } from 'lucide-react';
import { doc, updateDoc, arrayUnion, arrayRemove, collection, addDoc, onSnapshot, serverTimestamp, query, orderBy, deleteDoc, increment } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';

export default function PostItem({ post, chatId, currentUserId, isOwner }) {
    const [comments, setComments] = useState([]);
    const [showComments, setShowComments] = useState(false);
    const [commentText, setCommentText] = useState('');
    const [liked, setLiked] = useState(post.likes?.includes(currentUserId));

    // Listen to comments if expanded
    useEffect(() => {
        if (!showComments) return;
        const q = query(collection(db, "chats", chatId, "posts", post.id, "comments"), orderBy("createdAt", "asc"));
        const unsub = onSnapshot(q, (snap) => {
            setComments(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });
        return () => unsub();
    }, [showComments, chatId, post.id]);

    const handleLike = async () => {
        const ref = doc(db, "chats", chatId, "posts", post.id);
        if (liked) {
            await updateDoc(ref, { likes: arrayRemove(currentUserId) });
            setLiked(false);
        } else {
            await updateDoc(ref, { likes: arrayUnion(currentUserId) });
            setLiked(true);
            // Notify owner
            if (post.creatorId !== currentUserId) {
                addDoc(collection(db, "users", post.creatorId, "notifications"), {
                    type: 'like',
                    chatId,
                    postId: post.id,
                    senderName: auth.currentUser?.displayName || 'Someone',
                    createdAt: serverTimestamp(),
                    read: false
                });
            }
        }
    };

    const handlePostComment = async () => {
        if (!commentText.trim()) return;

        // 1. Add Comment
        await addDoc(collection(db, "chats", chatId, "posts", post.id, "comments"), {
            text: commentText,
            creatorId: currentUserId,
            creatorName: auth.currentUser?.displayName || 'Anonymous',
            creatorPhoto: auth.currentUser?.photoURL || null,
            createdAt: serverTimestamp()
        });

        // 2. Increment Count on Post
        updateDoc(doc(db, "chats", chatId, "posts", post.id), {
            commentCount: increment(1)
        }).catch(e => console.error("Countinc failed", e));

        // Notify owner
        if (post.creatorId !== currentUserId) {
            addDoc(collection(db, "users", post.creatorId, "notifications"), {
                type: 'comment',
                chatId,
                postId: post.id,
                senderName: auth.currentUser?.displayName || 'Someone',
                createdAt: serverTimestamp(),
                read: false
            });
        }
        setCommentText('');
    };

    const [deletingId, setDeletingId] = useState(null); // 'post' or commentId

    const handleDeleteComment = async (commentId) => {
        if (deletingId === commentId) {
            // Confirmed
            await deleteDoc(doc(db, "chats", chatId, "posts", post.id, "comments", commentId));

            // Decrement Count
            updateDoc(doc(db, "chats", chatId, "posts", post.id), {
                commentCount: increment(-1)
            }).catch(e => console.error("Countdec failed", e));

            setDeletingId(null);
        } else {
            // First click
            setDeletingId(commentId);
            setTimeout(() => setDeletingId(null), 3000); // Reset after 3s
        }
    };

    const handleDeletePost = async () => {
        if (deletingId === 'post') {
            await deleteDoc(doc(db, "chats", chatId, "posts", post.id));
        } else {
            setDeletingId('post');
            setTimeout(() => setDeletingId(null), 3000);
        }
    };

    const isMine = post.creatorId === currentUserId;
    const canDeletePost = isMine;

    return (
        <div className="glass-panel p-4 animate-in fade-in slide-in-from-bottom-2 relative group">


            <div className="relative z-10 flex items-start gap-3">
                <div className="relative">
                    <div className="w-10 h-10 rounded-full bg-gray-700 overflow-hidden shrink-0 border border-purple-500/30">
                        {post.creatorPhoto ? (
                            <img src={post.creatorPhoto} alt="" className="w-full h-full object-cover" />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center text-sm font-bold text-white bg-gradient-to-br from-purple-500 to-indigo-500">
                                {post.creatorName?.[0]?.toUpperCase() || '?'}
                            </div>
                        )}
                    </div>
                    {post.emojiStyle && (
                        <div className={`absolute z-20 select-none pointer-events-none drop-shadow-sm ${Array.from(post.emojiStyle).length > 2
                            ? '-bottom-3 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur-sm text-black px-1.5 py-0.5 rounded-md text-[7px] font-black uppercase border border-white/20 leading-tight shadow-sm whitespace-normal text-center w-max max-w-[55px] flex items-center justify-center'
                            : '-bottom-1 -right-1 text-base'}`}>
                            {post.emojiStyle}
                        </div>
                    )}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start">
                        <span className="font-bold text-sm text-purple-300">{post.creatorName}</span>
                        {canDeletePost && (
                            <button
                                onClick={handleDeletePost}
                                className={`transition-colors ${deletingId === 'post' ? 'text-red-500 font-bold text-xs animate-pulse' : 'text-gray-500 hover:text-red-500'}`}
                            >
                                {deletingId === 'post' ? 'Confirm?' : <Trash2 className="w-4 h-4" />}
                            </button>
                        )}
                    </div>
                    <p className="text-gray-200 mt-1 break-words">{post.text}</p>

                    {/* Actions */}
                    <div className="flex items-center gap-4 mt-3">
                        <button
                            onClick={handleLike}
                            className={`flex items-center gap-1 transition-colors text-sm ${liked ? 'text-pink-500' : 'text-gray-400 hover:text-pink-500'}`}
                        >
                            <Heart className="w-4 h-4" fill={liked ? "currentColor" : "none"} />
                            <span>{post.likes?.length || 0}</span>
                        </button>
                        <button
                            onClick={() => setShowComments(!showComments)}
                            className={`flex items-center gap-1 transition-colors text-sm ${showComments ? 'text-blue-400' : 'text-gray-400 hover:text-blue-400'}`}
                        >
                            <MessageCircle className="w-4 h-4" />
                            <span>{post.commentCount || (comments.length > 0 ? comments.length : 0)}</span>
                        </button>
                    </div>

                    {/* Comments Section */}
                    {showComments && (
                        <div className="mt-4 space-y-3 border-l-2 border-white/10 pl-3">
                            {comments.map(comment => (
                                <div key={comment.id} className="text-sm flex gap-2 items-start">
                                    <div className="w-6 h-6 rounded-full bg-gray-700 overflow-hidden shrink-0 border border-white/10 mt-0.5">
                                        {comment.creatorPhoto ? (
                                            <img src={comment.creatorPhoto} alt="" className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="flex items-center justify-center h-full w-full text-[10px] font-bold text-white bg-gray-600">
                                                {comment.creatorName?.[0]?.toUpperCase() || '?'}
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex justify-between">
                                            <span className="font-bold text-purple-200 text-xs">{comment.creatorName}</span>
                                            {(comment.creatorId === currentUserId) && (
                                                <button
                                                    onClick={() => handleDeleteComment(comment.id)}
                                                    className={`transition-colors ${deletingId === comment.id ? 'text-red-500 font-bold text-xs' : 'text-gray-500 hover:text-red-500'}`}
                                                >
                                                    {deletingId === comment.id ? 'Delete?' : <Trash2 className="w-3 h-3" />}
                                                </button>
                                            )}
                                        </div>
                                        <p className="text-gray-300 break-words whitespace-pre-wrap">{comment.text}</p>
                                    </div>
                                </div>
                            ))}

                            <div className="flex flex-col gap-1 mt-2 w-full max-w-full">
                                <div className="flex items-center gap-2 bg-white/5 rounded-xl p-1 border border-white/10">
                                    <input
                                        type="text"
                                        value={commentText}
                                        onChange={(e) => setCommentText(e.target.value)}
                                        placeholder="Reply..."
                                        maxLength={200}
                                        className="flex-1 min-w-0 bg-transparent border-none focus:outline-none px-3 py-1.5 text-sm text-white placeholder-gray-500"
                                        onKeyDown={e => e.key === 'Enter' && handlePostComment()}
                                    />
                                    <button
                                        onClick={handlePostComment}
                                        className="p-1.5 bg-blue-500/20 hover:bg-blue-500/40 text-blue-400 rounded-lg transition-colors shrink-0"
                                    >
                                        <Send className="w-4 h-4" />
                                    </button>
                                </div>
                                <div className={`text-[10px] text-right pr-2 transition-colors ${commentText.length >= 200 ? 'text-red-400 font-bold' : 'text-gray-600'}`}>
                                    {commentText.length}/200
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

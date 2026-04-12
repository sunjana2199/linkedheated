from flask import Flask, request
from flask_cors import CORS

import json
import os
import sys
import boto3
import streamlit as st
from PIL import Image

## We will be suing Titan Embeddings Model To generate Embedding

from langchain_community.embeddings import BedrockEmbeddings
from langchain.llms.bedrock import Bedrock

## Data Ingestion

import numpy as np
from langchain.document_loaders.csv_loader import CSVLoader

# Vector Embedding And Vector Store

from langchain_community.vectorstores import FAISS
from langchain_community.embeddings import HuggingFaceEmbeddings

## LLm Models
from langchain.prompts import PromptTemplate
from langchain.chains import RetrievalQA

app = Flask(__name__)
CORS(app)

## Bedrock Clients
bedrock=boto3.client(service_name="bedrock-runtime")
bedrock_embeddings=BedrockEmbeddings(model_id="amazon.titan-embed-text-v1",client=bedrock)

## Load CSV
def read_csv():
    loader = CSVLoader(file_path='messages.csv', encoding="utf-8", csv_args={
                    'delimiter': ','})
    data = loader.load()
    return data

## Vector Embedding and vector store
def get_vector_store(data):
    vectorstore_faiss=FAISS.from_documents(
        data,
        bedrock_embeddings
    )
    vectorstore_faiss.save_local("faiss_index")

def get_llama2_llm():
    ##create the Anthropic Model
    llm=Bedrock(model_id="meta.llama2-70b-chat-v1",client=bedrock,
                model_kwargs={'max_gen_len':512})
    
    return llm

prompt_template = """

System Prompt: Use the following pieces of context to provide a 
short answer to the question asked by the customer. Customer's name will be given at the start of the sentence. 
Answer within 1 or 2 statements. If you don't know the answer, 
just say that you don't know, don't try to make up an answer. 
You are Hari Prasad Renganathan. Answer how Hari Prasad Renganathan would answer it.
<context>
{context}
</context

Question: {question}

Hari:"""

PROMPT = PromptTemplate(
    template=prompt_template, input_variables=["context", "question"]
)

def get_response_llm(llm,vectorstore_faiss,query):
    qa = RetrievalQA.from_chain_type(
    llm=llm,
    chain_type="stuff",
    retriever=vectorstore_faiss.as_retriever(
        search_type="similarity", search_kwargs={"k": 3}
    ),
    return_source_documents=True,
    chain_type_kwargs={"prompt": PROMPT}
)
    answer=qa({"query":query})
    return answer['result']

@app.route('/run-python-script', methods=['POST'])
def run_python_script():
    # Parse incoming JSON data
    data = request.json  # Assuming JSON data is sent with the POST request

    faiss_index = FAISS.load_local("faiss_index", bedrock_embeddings)
    llm=get_llama2_llm()

    given_name = data['profile2']

    # Splitting by newlines and filtering out empty or irrelevant parts
    parts = [part.strip() for part in given_name.split('\n') if part.strip() and not any(char.isdigit() for char in part)]
    # Assuming the first relevant part is the name
    name = parts[0] if parts else ""

    user_question = name + ': '+ data['message2']

    llm_response = get_response_llm(llm,faiss_index,user_question)

    # Return the result as JSON
    return llm_response

if __name__ == '__main__':
    # Run the Flask app
    app.run(debug=True, port=5000)

